import type { InterpretedQuery, MergedListing, SortKey } from './types.js'
import { normalizeText } from './text.js'
import { warningPenalty } from './warnings.js'

/** 종류별 랭킹 가중치 — 감추지는 않되 아래로 내린다 */
const KIND_WEIGHT = {
  item: 1,
  accessory: 0.72,
  media: 0.68,
  bulk: 0.6,
  parts: 0.55,
  service: 0.3,
  wanted: 0.25,
} as const

/**
 * 질의 토큰이 제목에 얼마나, 얼마나 앞쪽에 나타나는가.
 * 0~1.
 */
export function relevanceScore(title: string, q: InterpretedQuery): number {
  const t = normalizeText(title)
  const compactTitle = t.replace(/\s+/g, '')
  const tokens = q.tokens
  if (tokens.length === 0) return 0.5

  let hits = 0
  let positionSum = 0
  for (const tok of tokens) {
    const at = compactTitle.indexOf(tok)
    if (at >= 0) {
      hits++
      // 앞쪽에 나올수록 1에 가깝다
      positionSum += 1 - Math.min(1, at / Math.max(20, compactTitle.length))
    }
  }
  if (hits === 0) return 0

  const coverage = hits / tokens.length
  const position = positionSum / hits
  // 제목이 지나치게 길면 이 검색어가 주인공이 아닐 확률이 높다
  const lengthPenalty = compactTitle.length > 60 ? 0.85 : 1

  return Math.min(1, (coverage * 0.75 + position * 0.25) * lengthPenalty)
}

/** 등록 후 시간 감쇠. 반감기 10일 */
export function freshnessScore(postedAt: Date | undefined, now: Date): number {
  if (!postedAt) return 0.45
  const days = Math.max(0, (now.getTime() - postedAt.getTime()) / 86_400_000)
  return Math.pow(0.5, days / 10)
}

/** 정보가 충실한 매물이 위로 */
export function completenessScore(l: MergedListing): number {
  let s = 0
  if (l.region) s += 0.3
  if (l.postedAt) s += 0.3
  if (l.thumbnailUrl) s += 0.3
  if (l.sources.length > 1) s += 0.1 // 여러 마켓에 걸린 매물은 실재할 확률이 높다
  return Math.min(1, s)
}

export interface ScoreBreakdown {
  relevance: number
  freshness: number
  completeness: number
  kind: number
  productBonus: number
  soldPenalty: number
  warnPenalty: number
  total: number
}

export function scoreListing(l: MergedListing, q: InterpretedQuery, now: Date): ScoreBreakdown {
  const relevance = relevanceScore(l.title, q)
  const freshness = freshnessScore(l.postedAt, now)
  const completeness = completenessScore(l)
  const kind = KIND_WEIGHT[l.kind]
  // 질의가 특정 모델을 가리키는데 매물도 그 모델이면 강한 보너스
  const productBonus = q.productId && l.productId === q.productId ? 0.25 : 0
  const soldPenalty = l.sold ? 0.5 : 1
  // 전문판매자 매물은 같은 글이 대량으로 반복되는 경향이 있어 아주 살짝 낮춘다
  const proPenalty = l.proSeller ? 0.95 : 1
  // 말이 안 되는 가격은 감추지 않고 아래로 내린다
  const pricePenalty = l.priceFlag === 'too-low' || l.priceFlag === 'too-high' ? 0.45 : 1
  // 가품·개조·예약 표기도 마찬가지 — 지우지 않고 순위만 낮춘다
  const warnPenalty = warningPenalty(l.warnings)

  const total =
    (relevance * 0.55 + freshness * 0.25 + completeness * 0.2 + productBonus) *
    kind * soldPenalty * proPenalty * pricePenalty * warnPenalty

  return {
    relevance: Number(relevance.toFixed(3)),
    freshness: Number(freshness.toFixed(3)),
    completeness: Number(completeness.toFixed(3)),
    kind,
    productBonus,
    soldPenalty,
    warnPenalty: Number(warnPenalty.toFixed(3)),
    total: Number(total.toFixed(4)),
  }
}

/**
 * 같은 마켓·같은 판매자가 상단을 도배하지 못하게 재배열한다.
 *
 * 통합검색의 존재 이유는 "여러 마켓을 한 번에" 이므로, 첫 화면에 한 마켓만 나오면 실패다.
 * 마켓별 갱신 시각 정책이 달라(번개장터는 끌올할 때마다 시각이 갱신된다)
 * 순수 점수순으로 두면 특정 마켓이 구조적으로 유리해지는 문제도 함께 해결한다.
 *
 * 점수 자체는 건드리지 않고, 이미 뽑은 개수에 따라 감가한 값으로 다음 후보를 고른다.
 */
export function diversify(
  items: readonly MergedListing[],
  { sourceDecay = 0.93, sellerDecay = 0.75 } = {},
): MergedListing[] {
  const pool = [...items]
  const out: MergedListing[] = []
  const sourceSeen = new Map<string, number>()
  const sellerSeen = new Map<string, number>()

  while (pool.length > 0) {
    let bestIdx = 0
    let bestVal = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const l = pool[i]!
      const sKey = l.sources.join('+')
      const seller = l.sellerId ? `${l.source}:${l.sellerId}` : null
      const adjusted =
        l.score *
        Math.pow(sourceDecay, sourceSeen.get(sKey) ?? 0) *
        (seller ? Math.pow(sellerDecay, sellerSeen.get(seller) ?? 0) : 1)
      if (adjusted > bestVal) {
        bestVal = adjusted
        bestIdx = i
      }
    }
    const [picked] = pool.splice(bestIdx, 1) as [MergedListing]
    out.push(picked)
    const sKey = picked.sources.join('+')
    sourceSeen.set(sKey, (sourceSeen.get(sKey) ?? 0) + 1)
    if (picked.sellerId) {
      const seller = `${picked.source}:${picked.sellerId}`
      sellerSeen.set(seller, (sellerSeen.get(seller) ?? 0) + 1)
    }
  }
  return out
}

/** 점수를 매기고 정렬한다 */
export function rank(
  items: readonly MergedListing[],
  q: InterpretedQuery,
  sort: SortKey = 'relevance',
  now: Date = new Date(),
): MergedListing[] {
  const scored = items.map((l) => ({ ...l, score: scoreListing(l, q, now).total }))
  switch (sort) {
    case 'price_asc':
      return scored.sort((a, b) => a.priceKrw - b.priceKrw || b.score - a.score)
    case 'price_desc':
      return scored.sort((a, b) => b.priceKrw - a.priceKrw || b.score - a.score)
    case 'recent':
      return scored.sort(
        (a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0) || b.score - a.score,
      )
    case 'relevance':
    default:
      return diversify(scored.sort((a, b) => b.score - a.score))
  }
}
