import type {
  EnrichedListing, Facets, InterpretedQuery, MergedListing, RawListing,
  SearchFilters, SortKey,
} from './types.js'
import type { ProductMatcher } from './catalog.js'
import { enrichAll, dedupeBySourceId } from './enrich.js'
import { mergeDuplicates } from './dedupe.js'
import { rank } from './rank.js'
import { applyFilters, computeFacets } from './filter.js'

export interface BuildResultInput {
  interpreted: InterpretedQuery
  listings: readonly RawListing[]
  matcher: ProductMatcher
  sort?: SortKey
  page?: number
  perPage?: number
  filters?: SearchFilters
  now?: Date
}

export interface BuiltResult {
  items: MergedListing[]
  total: number
  page: number
  perPage: number
  sort: SortKey
  facets: Facets
  /** 병합 전 전체 매물 (영속화용) */
  enriched: EnrichedListing[]
}

/**
 * 질의에서 읽어낸 가격 조건과 사용자가 UI에서 건 필터를 합친다.
 * 명시적으로 건 필터가 언제나 우선한다.
 */
export function mergeFilters(q: InterpretedQuery, filters?: SearchFilters): SearchFilters {
  const f: SearchFilters = { ...(filters ?? {}) }
  if (f.minPrice === undefined && q.minPrice !== undefined) f.minPrice = q.minPrice
  if (f.maxPrice === undefined && q.maxPrice !== undefined) f.maxPrice = q.maxPrice
  return f
}

/**
 * 수집된 원본 매물 → 화면에 뿌릴 결과.
 * 네트워크·DB를 모르는 순수 함수라 그대로 테스트할 수 있다.
 */
export function buildSearchResult(input: BuildResultInput): BuiltResult {
  const {
    interpreted, listings, matcher,
    sort = 'relevance', page = 1, perPage = 24, now = new Date(),
  } = input

  const filters = mergeFilters(interpreted, input.filters)
  const enriched = dedupeBySourceId(enrichAll(listings, matcher))
  const merged = mergeDuplicates(enriched)
  const ranked = rank(merged, interpreted, sort, now)

  const facets = computeFacets(ranked, filters, now)
  const filtered = applyFilters(ranked, filters, now)

  const start = Math.max(0, (page - 1) * perPage)
  return {
    items: filtered.slice(start, start + perPage),
    total: filtered.length,
    page,
    perPage,
    sort,
    facets,
    enriched,
  }
}
