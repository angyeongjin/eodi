/**
 * 정기 정리. 무료 티어 용량을 지키는 것이 목적이다.
 *   npx tsx src/cli/maintain.ts --listing-days=90 --log-days=180
 */
import {
  purgeExpiredCache, pruneOldListings, pruneOldLogs, indexStats, closeSql, hasDb,
  allUnresolvedTerms, resolveUntranslated,
} from '@eodi/db'
import { translateToJapanese, suggestCorrection } from '@eodi/core'

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

/*
  사전에 넣었거나 오타로 밝혀진 말을 미번역 목록에서 내린다.
  목록이 잡음으로 차면 아무도 안 보게 되고, 그러면 사전이 안 자란다.
*/
const pending = await allUnresolvedTerms()
const done = pending.filter((t) => Boolean(translateToJapanese(t).ja) || Boolean(suggestCorrection(t)))
const closed = await resolveUntranslated(done)
const after = await indexStats()

console.log(`만료 캐시 ${cache}건 삭제`)
console.log(`오래된 매물 ${listings}건 삭제`)
console.log(`인덱스 ${before.total.toLocaleString('ko-KR')} → ${after.total.toLocaleString('ko-KR')}건`)
console.log(`미번역 목록 ${closed}건 해결 처리 (남은 대상 ${pending.length - closed}건)`)
await closeSql()
