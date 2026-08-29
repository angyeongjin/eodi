/**
 * 계측 보고.
 *
 * 런치 플랜의 성공/실패 판단 기준(원본 클릭률 25%, 해외 탭 세션 10%)을 사람이 읽을 수 있게 찍는다.
 * 이 숫자를 공개 페이지에 올리지 않는 이유는 하나다 — 제휴 협상에 쓸 값이라 우리가 먼저 보고 판단해야 한다.
 *
 *   npm run metrics -w @eodi/crawler -- --days=7
 */
import { outboundStats, zeroResultQueries, closeSql, hasDb } from '@eodi/db'
import { SOURCE_LABEL, SCOPE_LABEL, type SourceId } from '@eodi/core'

const daysArg = process.argv.find((a) => a.startsWith('--days='))
const days = Math.max(1, Math.min(90, Number(daysArg?.split('=')[1] ?? 7) || 7))

if (!hasDb()) {
  console.log('DATABASE_URL 이 없습니다. 계측은 DB 에 쌓이므로 운영 환경변수로 실행하세요.')
  process.exit(0)
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

const stats = await outboundStats(days)

console.log(`## 최근 ${days}일 계측\n`)

if (stats.searches === 0) {
  console.log('아직 검색이 없습니다. 유입이 먼저입니다.')
} else {
  console.log(`- 검색 ${stats.searches.toLocaleString('ko-KR')}회`)
  console.log(`- 원본 클릭 ${stats.clicks.toLocaleString('ko-KR')}회`)
  console.log(`- **클릭률 ${pct(stats.ctr)}** ${stats.ctr < 0.25 ? '— 기준(25%) 미달. 랭킹 가중치를 본다' : '— 기준 충족'}`)

  const overseas = stats.byScope.find((s) => s.scope === 'overseas')
  const overseasShare = stats.searches > 0 ? (overseas?.searches ?? 0) / stats.searches : 0
  console.log(
    `- **해외 탭 비중 ${pct(overseasShare)}** ${
      overseasShare < 0.1 ? '— 기준(10%) 미달. 첫 화면에서 굿즈를 더 앞으로' : '— 기준 충족'
    }`,
  )

  console.log('\n### 탭별\n')
  console.log('| 탭 | 검색 | 클릭 | 클릭률 |')
  console.log('|---|---:|---:|---:|')
  for (const r of stats.byScope) {
    console.log(`| ${SCOPE_LABEL[r.scope]} | ${r.searches} | ${r.clicks} | ${pct(r.ctr)} |`)
  }

  if (stats.bySource.length > 0) {
    // 마켓 제휴를 제안할 때 내미는 표가 정확히 이것이다 — 우리가 어디로 얼마나 보내는가.
    console.log('\n### 어느 마켓으로 보냈나\n')
    console.log('| 마켓 | 클릭 | 비중 |')
    console.log('|---|---:|---:|')
    for (const r of stats.bySource) {
      console.log(`| ${SOURCE_LABEL[r.source as SourceId] ?? r.source} | ${r.clicks} | ${pct(r.share)} |`)
    }
  }

  if (stats.byPosition.length > 0) {
    console.log('\n### 몇 번째 결과가 눌렸나\n')
    const top = stats.byPosition.slice(0, 5)
    console.log(top.map((r) => `${r.position + 1}위 ${r.clicks}회`).join(' · '))
    const firstThree = stats.byPosition
      .filter((r) => r.position < 3)
      .reduce((a, b) => a + b.clicks, 0)
    console.log(`\n상위 3개가 전체 클릭의 ${pct(stats.clicks > 0 ? firstThree / stats.clicks : 0)}`)
  }
}

const zeros = await zeroResultQueries(20, days)
if (zeros.length > 0) {
  console.log('\n### 0건이었던 검색어 — 다음 보강 대상\n')
  console.log('| 검색어 | 탭 | 횟수 | 마지막 |')
  console.log('|---|---|---:|---|')
  for (const z of zeros) {
    console.log(
      `| ${z.term} | ${SCOPE_LABEL[z.scope]} | ${z.count} | ${z.lastSeen.toISOString().slice(0, 10)} |`,
    )
  }
  console.log('\n해외 탭이면 굿즈 사전(`npm run untranslated`), 국내 탭이면 카탈로그·별칭을 본다.')
}

await closeSql()
