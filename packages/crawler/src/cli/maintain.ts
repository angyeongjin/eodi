/**
 * 정기 정리. 무료 티어 용량을 지키는 것이 목적이다.
 *   npx tsx src/cli/maintain.ts --listing-days=90 --log-days=180
 */
import {
  purgeExpiredCache, pruneOldListings, pruneOldLogs, indexStats, closeSql, hasDb,
  allUnresolvedTerms, resolveUntranslated, dbSizeBytes, pruneToRowLimit,
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
/*
  용량으로 막는다.

  보존 기간만으로는 무료 티어를 못 지킨다 — 하루 6만 건씩 쌓이면 0.5GB 를
  닷새면 채우는데 그때까지 90일 지난 매물은 하나도 없다.
  한계에 가까우면 최근에 본 것부터 남기고 나머지를 버린다.
*/
const maxMb = arg('max-mb', 380)
const sizeBefore = await dbSizeBytes()
let capped = 0
if (sizeBefore > maxMb * 1024 * 1024) {
  const stats = await indexStats()
  const perRow = stats.total > 0 ? sizeBefore / stats.total : 1200
  // 목표 용량의 80% 를 매물에 준다. 나머지는 캐시·로그·여유.
  const keep = Math.max(10_000, Math.floor((maxMb * 1024 * 1024 * 0.8) / perRow))
  capped = await pruneToRowLimit(keep)
}

const after = await indexStats()
const sizeAfter = await dbSizeBytes()

console.log(`만료 캐시 ${cache}건 삭제`)
console.log(`오래된 매물 ${listings}건 삭제`)
console.log(`인덱스 ${before.total.toLocaleString('ko-KR')} → ${after.total.toLocaleString('ko-KR')}건`)
console.log(`미번역 목록 ${closed}건 해결 처리 (남은 대상 ${pending.length - closed}건)`)
const mb = (b: number) => (b / 1024 / 1024).toFixed(0)
console.log(`DB 용량 ${mb(sizeBefore)} → ${mb(sizeAfter)} MB (상한 ${maxMb} MB)`)
if (capped > 0) console.log(`용량 초과로 오래된 매물 ${capped.toLocaleString('ko-KR')}건 추가 정리`)
else if (sizeAfter > maxMb * 1024 * 1024 * 0.8) console.log('⚠ 용량이 상한의 80% 를 넘었습니다')
await closeSql()
