/**
 * 정기 정리. 무료 티어 용량을 지키는 것이 목적이다.
 *   npx tsx src/cli/maintain.ts --listing-days=90 --log-days=180
 */
import { purgeExpiredCache, pruneOldListings, pruneOldLogs, indexStats, closeSql, hasDb } from '@eodi/db'

function arg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

if (!hasDb()) {
  console.log('DATABASE_URL 이 없어 정리할 것이 없습니다.')
  process.exit(0)
}

const before = await indexStats()
const cache = await purgeExpiredCache()
const listings = await pruneOldListings(arg('listing-days', 90))
await pruneOldLogs(arg('log-days', 180))
const after = await indexStats()

console.log(`만료 캐시 ${cache}건 삭제`)
console.log(`오래된 매물 ${listings}건 삭제`)
console.log(`인덱스 ${before.total.toLocaleString('ko-KR')} → ${after.total.toLocaleString('ko-KR')}건`)
await closeSql()
