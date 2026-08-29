import type {
  EnrichedListing, Facets, ListingKind, MergedListing, SearchFilters, SourceId,
} from './types.js'
import { HIDDEN_BY_DEFAULT } from './types.js'

/** 가격 패싯 구간 (원) */
const PRICE_BUCKETS: Array<[number, number | null]> = [
  [0, 50_000],
  [50_000, 100_000],
  [100_000, 300_000],
  [300_000, 500_000],
  [500_000, 1_000_000],
  [1_000_000, 2_000_000],
  [2_000_000, null],
]

export function visibleKinds(filters?: SearchFilters): ListingKind[] {
  if (filters?.kinds?.length) return filters.kinds
  const all: ListingKind[] = ['item', 'accessory', 'media', 'parts', 'wanted', 'service', 'bulk']
  return all.filter((k) => !HIDDEN_BY_DEFAULT.includes(k))
}

/** 패싯 계산 시 잠시 무시할 필터 축 */
export type FilterAxis = 'price' | 'sources' | 'kinds' | 'region' | 'sold' | 'within'

/**
 * 필터 통과 여부.
 * skip 축은 검사하지 않는다 — 패싯 개수를 셀 때 "그 축을 뺀 나머지" 기준이 필요하기 때문이다.
 */
export function passesFilters<T extends MergedListing | EnrichedListing>(
  l: T,
  filters: SearchFilters | undefined,
  now: Date,
  skip: FilterAxis | null = null,
): boolean {
  const f = filters ?? {}
  // 사용자가 입력하는 가격 조건은 언제나 원화다
  if (skip !== 'price') {
    if (f.minPrice !== undefined && l.priceKrw < f.minPrice) return false
    if (f.maxPrice !== undefined && l.priceKrw > f.maxPrice) return false
  }
  if (skip !== 'sources' && f.sources?.length) {
    const srcs = 'sources' in l ? (l as MergedListing).sources : [l.source]
    if (!srcs.some((s) => f.sources!.includes(s))) return false
  }
  if (skip !== 'kinds' && !visibleKinds(f).includes(l.kind)) return false
  if (skip !== 'region' && f.region && !(l.region ?? '').includes(f.region)) return false
  if (skip !== 'sold' && !f.includeSold && l.sold) return false
  if (skip !== 'within' && f.withinDays !== undefined) {
    if (!l.postedAt) return false
    const days = (now.getTime() - l.postedAt.getTime()) / 86_400_000
    if (days > f.withinDays) return false
  }
  return true
}

export function matchesFilters<T extends MergedListing | EnrichedListing>(
  l: T,
  filters: SearchFilters | undefined,
  now: Date,
): boolean {
  return passesFilters(l, filters, now, null)
}

export function applyFilters(
  items: readonly MergedListing[],
  filters: SearchFilters | undefined,
  now: Date = new Date(),
): MergedListing[] {
  return items.filter((l) => matchesFilters(l, filters, now))
}

/**
 * 패싯 개수.
 * 각 축의 개수는 **그 축을 제외한 나머지 필터**를 적용한 뒤 센다.
 * (마켓 필터를 켠 채로 마켓별 개수가 0이 되어버리면 필터를 되돌릴 수 없다)
 */
export function computeFacets(
  items: readonly MergedListing[],
  filters: SearchFilters | undefined,
  now: Date = new Date(),
): Facets {
  const on = (axis: FilterAxis) => items.filter((l) => passesFilters(l, filters, now, axis))

  const sourceCounts = new Map<SourceId, number>()
  for (const l of on('sources')) {
    for (const s of l.sources) sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1)
  }

  const kindCounts = new Map<ListingKind, number>()
  for (const l of on('kinds')) kindCounts.set(l.kind, (kindCounts.get(l.kind) ?? 0) + 1)

  const regionCounts = new Map<string, number>()
  for (const l of on('region')) {
    if (!l.region) continue
    // "서울특별시 송파구 잠실본동" → "서울특별시 송파구" 수준으로 묶는다
    const key = l.region.split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
    if (key) regionCounts.set(key, (regionCounts.get(key) ?? 0) + 1)
  }

  const priceBase = on('price')
  const priceBuckets = PRICE_BUCKETS.map(([from, to]) => ({
    from,
    to,
    count: priceBase.filter((l) => l.priceKrw >= from && (to === null || l.priceKrw < to)).length,
  })).filter((b) => b.count > 0)

  return {
    sources: [...sourceCounts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count),
    kinds: [...kindCounts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count),
    regions: [...regionCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    priceBuckets,
  }
}
