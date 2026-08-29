/**
 * 굿즈 사전 보강 대상 보고.
 *
 * 사용자가 검색했는데 우리가 일본어로 못 옮긴 말들이다.
 * 이 목록이 곧 다음에 사전에 넣어야 할 것이고, 사전이 자라는 유일한 경로다.
 */
import { topUntranslated, closeSql, hasDb } from '@eodi/db'

if (!hasDb()) {
  console.log('DATABASE_URL 이 없어 기록된 검색어가 없습니다.')
  process.exit(0)
}

const rows = await topUntranslated(50)
if (rows.length === 0) {
  console.log('번역하지 못한 검색어가 없습니다. 사전이 잘 따라가고 있습니다.')
} else {
  console.log(`## 굿즈 사전 보강 대상 ${rows.length}건\n`)
  console.log('| 검색어 | 횟수 | 마지막 |')
  console.log('|---|---:|---|')
  for (const r of rows) {
    console.log(`| ${r.term} | ${r.hits} | ${r.lastSeen.toISOString().slice(0, 10)} |`)
  }
  console.log('\n`packages/core/scripts/build-goods.ts` 에 추가한 뒤 `npm run build:goods` 를 돌리세요.')
}
await closeSql()
