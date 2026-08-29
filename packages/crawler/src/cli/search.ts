/**
 * 통합 검색 CLI. DB 없이도 동작한다.
 *   npx tsx src/cli/search.ts "아이폰16 프로 100만원 이하"
 */
import {
  SOURCE_LABEL, KIND_LABEL, formatMoney, formatApproxKrw,
  type SortKey, type MarketScope,
} from '@eodi/core'
import { search } from '../service.js'

const args = process.argv.slice(2)
const sortArg = args.find((a) => a.startsWith('--sort='))?.split('=')[1] as SortKey | undefined
const scope: MarketScope = args.includes('--overseas') ? 'overseas' : 'domestic'
const term = args.filter((a) => !a.startsWith('--')).join(' ') || '아이폰16 프로'

const res = await search({ q: term, sort: sortArg ?? 'relevance', perPage: 12, scope })

const won = (n: number) => n.toLocaleString('ko-KR') + '원'

console.log(`\n검색어: "${res.query}"  [${res.scope === 'overseas' ? '일본' : '국내'}]`)
if (res.scope === 'overseas') {
  console.log(`번역  : ${res.interpreted.overseasTerm ?? '✗ 사전에 없는 말입니다'}` +
    (res.interpreted.translationHits?.length
      ? `  (${res.interpreted.translationHits.map((h) => `${h.ko}→${h.ja}`).join(', ')})`
      : '') +
    (res.interpreted.untranslated?.length ? `  미해결: ${res.interpreted.untranslated.join(',')}` : ''))
  if (res.fx) console.log(`환율  : 100엔 = ${Math.round(res.fx.jpyToKrw * 100).toLocaleString('ko-KR')}원 (${res.fx.asOf})`)
}
const i = res.interpreted
console.log(`해석  : term="${i.searchTerm}"` +
  (i.productName ? ` · 모델=${i.productName}` : '') +
  (i.storageGb ? ` · ${i.storageGb}GB` : '') +
  (i.minPrice ? ` · 최소 ${won(i.minPrice)}` : '') +
  (i.maxPrice ? ` · 최대 ${won(i.maxPrice)}` : ''))
console.log(`결과  : ${res.total}건 (${res.tookMs}ms${res.cached ? ', 캐시' : ''}${res.fromIndex ? `, 인덱스 보강 ${res.fromIndex}건` : ''})`)

console.log('\n[소스]')
for (const s of res.sources) {
  const mark = s.ok ? '✅' : '⚠️ '
  const region = s.regionLabel ? ` (${s.regionLabel})` : ''
  console.log(`  ${mark} ${SOURCE_LABEL[s.source].padEnd(6)}${region.padEnd(16)} ${String(s.count).padStart(3)}건 ${String(s.durationMs).padStart(5)}ms ${s.error ?? ''}`)
}

console.log('\n[결과]')
for (const [n, l] of res.items.entries()) {
  const badges = [
    l.sources.map((s) => SOURCE_LABEL[s]).join('+'),
    l.kind !== 'item' ? KIND_LABEL[l.kind] : null,
    l.variant.storageGb ? `${l.variant.storageGb}GB` : null,
    l.sold ? '판매완료' : null,
    l.duplicates.length ? `중복${l.duplicates.length + 1}` : null,
  ].filter(Boolean).join(' · ')
  const priceText = l.currency === 'JPY'
    ? `${formatMoney(l.price, 'JPY')} (${formatApproxKrw(l.priceKrw)})`
    : won(l.price)
  console.log(`${String(n + 1).padStart(2)}. ${priceText.padStart(26)}  ${l.title.slice(0, 40)}`)
  const extra = [
    l.listingType === 'auction' ? `경매${l.bidCount ? ` ${l.bidCount}입찰` : ''}` : null,
    l.endsAt ? `마감 ${l.endsAt.toISOString().slice(5, 16).replace('T', ' ')}` : null,
    l.shippingFee ? `배송 ${formatMoney(l.shippingFee, 'JPY')}` : null,
  ].filter(Boolean).join(' · ')
  console.log(`    ${badges}${extra ? '  ' + extra : ''}  ${l.region ?? ''}  score=${l.score}`)
}

console.log('\n[패싯]')
console.log('  마켓  :', res.facets.sources.map((s) => `${SOURCE_LABEL[s.id]} ${s.count}`).join(' · '))
console.log('  종류  :', res.facets.kinds.map((k) => `${KIND_LABEL[k.id]} ${k.count}`).join(' · '))
console.log('  가격대:', res.facets.priceBuckets.map((b) => `${b.from / 10000}~${b.to ? b.to / 10000 : ''}만 ${b.count}`).join(' · '))
if (res.facets.regions.length) console.log('  지역  :', res.facets.regions.slice(0, 6).map((r) => `${r.name} ${r.count}`).join(' · '))
