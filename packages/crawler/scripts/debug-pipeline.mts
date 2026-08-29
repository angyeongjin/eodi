/**
 * 검색 파이프라인 단계별 진단.
 *
 * "결과가 왜 이것밖에 안 나오지?" 를 추적할 때 쓴다.
 * 수집 → 분류 → 병합 → 필터 각 단계에서 몇 건이 남는지 보여주므로
 * 어느 단계가 결과를 잡아먹었는지 바로 드러난다.
 * (실제로 이 도구가 "삼"이라는 한 글자 사전 항목 때문에
 *  "삼성 냉장고" 결과 100건이 3건으로 줄어든 사고를 찾아냈다)
 *
 *   npx tsx scripts/debug-pipeline.mts "삼성 냉장고"
 *   npx tsx scripts/debug-pipeline.mts --overseas "주술회전 아크릴스탠드"
 */
import {
  enrichAll, mergeDuplicates, interpretQuery, applyFilters, relevanceScore,
  translateToJapanese, type MarketScope,
} from '@eodi/core'
import { federate } from '../src/federate.js'
import { matcher } from '../src/service.js'

const args = process.argv.slice(2)
const scope: MarketScope = args.includes('--overseas') ? 'overseas' : 'domestic'
const term = args.filter((a) => !a.startsWith('--')).join(' ') || '삼성 냉장고'

const m = matcher()
const q = interpretQuery(term, m)

let marketTerm = q.searchTerm
if (scope === 'overseas') {
  const tr = translateToJapanese(q.searchTerm)
  console.log(`번역: ${q.searchTerm} → ${tr.ja ?? '(불가)'}${tr.unresolved.length ? `  미해결: ${tr.unresolved.join(',')}` : ''}`)
  if (!tr.ja) process.exit(0)
  marketTerm = tr.ja
}

const r = await federate(marketTerm, { scope })
console.log(`수집: ${r.listings.length}건  ${r.statuses.map((s) => `${s.source}:${s.ok ? s.count : 'x'}`).join(' ')}`)

const en = enrichAll(r.listings, m)
const byKind: Record<string, number> = {}
for (const e of en) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1
console.log('분류:', byKind)
console.log(`판매완료: ${en.filter((e) => e.sold).length}건 · 경고 있음: ${en.filter((e) => e.warnings.length).length}건`)

const merged = mergeDuplicates(en)
console.log(`병합: ${merged.length}건 (중복 ${en.length - merged.length}건 묶임)`)
console.log(`기본 필터 통과: ${applyFilters(merged, undefined).length}건`)
console.log(`관련도 0점: ${en.filter((e) => relevanceScore(e.title, q) === 0).length}건`)

for (const e of en.slice(0, 6)) {
  console.log(`  ${e.source.padEnd(14)} ${e.kind.padEnd(10)} rel=${relevanceScore(e.title, q).toFixed(2)} ${e.title.slice(0, 40)}`)
}
