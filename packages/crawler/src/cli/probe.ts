/**
 * 소스 연결 점검.
 * "지금 우리 어댑터가 실제로 동작하는가" 를 사람이 30초 안에 확인할 수 있어야 한다.
 *   npm run probe -w @eodi/crawler -- "아이폰16 프로"
 */
import { allAdapters } from '../adapters/index.js'
import { stats, resetStats } from '../http.js'

const term = process.argv.slice(2).join(' ') || '아이폰16 프로'
console.log(`검색어: "${term}"\n`)
resetStats()

for (const a of allAdapters()) {
  if (!a.enabled) {
    console.log(`⏸  ${a.label.padEnd(8)} 비활성 — ${a.disabledReason ?? ''}`)
    continue
  }
  const t0 = Date.now()
  try {
    const rows = await a.search(term, { limit: 20, sort: 'relevance' })
    const ms = Date.now() - t0
    console.log(`✅ ${a.label.padEnd(8)} ${String(rows.length).padStart(3)}건  ${ms}ms`)
    for (const r of rows.slice(0, 3)) {
      const price = r.price.toLocaleString('ko-KR')
      const when = r.postedAt ? r.postedAt.toISOString().slice(0, 10) : '     -    '
      console.log(`     ${price.padStart(11)}원  ${when}  ${(r.region ?? '-').slice(0, 14).padEnd(14)}  ${r.title.slice(0, 42)}`)
    }
  } catch (err) {
    console.log(`❌ ${a.label.padEnd(8)} 실패 — ${err instanceof Error ? err.message : err}`)
  }
  console.log()
}

console.log(`요청 ${stats.requests}회 · 재시도 ${stats.retries}회 · 실패 ${stats.failures}회 · ${(stats.bytes / 1024).toFixed(0)}KB`)
