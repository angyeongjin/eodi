/**
 * 인기 검색어 예열.
 *
 * 두 가지를 동시에 한다.
 *  1) 자주 쓰는 검색어의 캐시를 미리 채워, 사용자 요청이 캐시 히트로 즉답되게 한다.
 *  2) 당근처럼 지역 스코프인 소스를 여러 지역으로 돌며 우리 인덱스의 전국 커버리지를 넓힌다.
 *
 *   npx tsx src/cli/prewarm.ts --keywords=40 --regions=6
 */
import { popularQueries, closeSql, hasDb, indexStats, purgeExpiredCache } from '@eodi/db'
import { search } from '../service.js'
import { SEED_KEYWORDS, prewarmRegions } from '../regions.js'
import { GOODS_TERMS, type MarketScope } from '@eodi/core'
import { stats, resetStats } from '../http.js'

function arg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const keywordLimit = arg('keywords', 30)
const regionLimit = arg('regions', 4)
const scope: MarketScope = process.argv.includes('--scope=overseas') ? 'overseas' : 'domestic'
const started = Date.now()

resetStats()

/*
  국내는 "사람들이 실제로 찾은 검색어"를, 해외는 "굿즈 사전의 한글 표제어"를 예열한다.
  해외 예열이 굿즈 사전 표제어를 쓰는 이유: 그게 우리가 번역할 수 있는 말의 전부이고,
  그 결과가 곧 인덱스가 되어 메루카리처럼 실시간 조회가 안 되는 소스를 메운다.
*/
let keywords: string[]
let regions: Array<{ slug: string; dong: string }>
if (scope === 'overseas') {
  keywords = [...new Set(GOODS_TERMS.map((t) => t.ko[0]!).filter(Boolean))].slice(0, keywordLimit)
  regions = [{ slug: '', dong: '-' }] // 해외 소스는 지역 개념이 없다
} else {
  const popular = (await popularQueries(keywordLimit)).map((p) => p.term)
  keywords = [...new Set([...popular, ...SEED_KEYWORDS])].slice(0, keywordLimit)
  regions = prewarmRegions(regionLimit)
}

console.log(
  `예열 시작 [${scope === 'overseas' ? '일본' : '국내'}] — 검색어 ${keywords.length}개 × 지역 ${regions.length}곳` +
    `${hasDb() ? '' : ' (DB 없음: 캐시만 데워집니다)'}`,
)

let done = 0
let totalItems = 0
const failures: string[] = []

for (const term of keywords) {
  for (const region of regions) {
    try {
      const res = await search(
        { q: term, regionSlug: region.slug || undefined, perPage: 1, scope },
        // 예열은 사용자를 기다리게 하지 않으므로 페이지를 더 넘겨 인덱스를 깊게 판다
        { refresh: true, federate: { limitPerSource: 200, maxRequests: 3, timeoutMs: 25_000 } },
      )
      totalItems += res.total
      done++
      const okSources = res.sources.filter((s) => s.ok).length
      console.log(
        `  [${String(done).padStart(3)}/${keywords.length * regions.length}] ` +
          `${term.padEnd(12).slice(0, 12)} @ ${region.dong.padEnd(8).slice(0, 8)} ` +
          `→ ${String(res.total).padStart(4)}건 · 소스 ${okSources}개 · ${res.tookMs}ms`,
      )
    } catch (err) {
      done++
      const msg = `${term}@${region.dong}: ${err instanceof Error ? err.message : err}`
      failures.push(msg)
      console.log(`  [!] ${msg}`)
    }
  }
}

const purged = await purgeExpiredCache()
const idx = await indexStats()

console.log(`\n예열 완료 — ${((Date.now() - started) / 1000).toFixed(1)}초`)
console.log(`  조합 ${done}건 · 결과 합계 ${totalItems}건 · 실패 ${failures.length}건`)
console.log(`  HTTP 요청 ${stats.requests}회 · 재시도 ${stats.retries} · 실패 ${stats.failures} · ${(stats.bytes / 1024 / 1024).toFixed(1)}MB`)
console.log(`  만료 캐시 정리 ${purged}건`)
console.log(`  인덱스 총 ${idx.total.toLocaleString('ko-KR')}건 ${idx.bySource.map((s) => `${s.source} ${s.count}`).join(' · ')}`)

await closeSql()
if (failures.length > done / 2) {
  console.error('\n절반 이상 실패했습니다. 소스 상태를 확인하세요.')
  process.exitCode = 1
}
