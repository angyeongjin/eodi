import type { CatalogProduct, EnrichedListing, ListingKind, PriceFlag, RawListing } from './types.js'
import { SOURCE_SCOPE } from './types.js'
import { toKrw } from './fx.js'
import type { ProductMatcher } from './catalog.js'
import { classifyKind } from './classify.js'
import { extractVariant } from './variant.js'
import { normalizeText } from './text.js'
import { detectWarnings } from './warnings.js'

/** 출시가 대비 이 배율을 벗어나면 사람이 한 번 확인해야 하는 가격이다 */
export const PRICE_TOO_LOW_RATIO = 0.15
export const PRICE_TOO_HIGH_RATIO = 2.5

/**
 * 가격 이상 판정.
 * 0원은 나눔이라는 정상적인 거래 형태이므로 경고가 아니라 라벨이다.
 * 본품(item)이 아닌 글은 원래 싸므로 판정하지 않는다.
 */
export function flagPrice(
  price: number,
  kind: ListingKind,
  product: CatalogProduct | undefined,
): PriceFlag | null {
  if (price === 0) return 'free'
  if (kind !== 'item') return null
  if (!product?.msrp) return null
  if (price < product.msrp * PRICE_TOO_LOW_RATIO) return 'too-low'
  if (price > product.msrp * PRICE_TOO_HIGH_RATIO) return 'too-high'
  return null
}

/** 원본 매물 → 검색·랭킹·중복판별에 필요한 정보가 붙은 매물 */
export function enrich(raw: RawListing, matcher: ProductMatcher): EnrichedListing {
  const m = matcher.match(raw.title)
  const product = m ? matcher.get(m.productId) : undefined
  const { kind, hit } = classifyKind(raw.title, product ? { category: product.category } : {})
  // 통화가 섞인 목록에서 원본 price 로 비교하면 ¥2,000 이 2,000원처럼 취급된다.
  // 필터·정렬·중복판별은 전부 원화 환산가를 쓴다.
  const priceKrw = toKrw(raw.price, raw.currency)
  return {
    ...raw,
    productId: m?.productId ?? null,
    variant: extractVariant(raw.title, product),
    kind,
    kindHit: hit,
    matchScore: m?.score ?? 0,
    normTitle: normalizeText(raw.title),
    priceFlag: flagPrice(priceKrw, kind, product),
    priceKrw,
    scope: SOURCE_SCOPE[raw.source],
    warnings: detectWarnings(raw.title),
  }
}

export function enrichAll(raws: readonly RawListing[], matcher: ProductMatcher): EnrichedListing[] {
  return raws.map((r) => enrich(r, matcher))
}

/** 같은 소스에서 같은 글이 두 번 들어오는 것을 막는다 */
export function dedupeBySourceId<T extends { source: string; sourceItemId: string }>(list: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const l of list) {
    const k = `${l.source}:${l.sourceItemId}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(l)
  }
  return out
}
