import type { ListingKind, MarketScope, SearchFilters, SearchQuery, SortKey, SourceId } from '@eodi/core'

const SORTS: SortKey[] = ['relevance', 'recent', 'price_asc', 'price_desc']
const SOURCES: SourceId[] = [
  'bunjang', 'daangn', 'joongna', 'hellomarket', 'yahoo_auction', 'mercari',
]
const KINDS: ListingKind[] = ['item', 'accessory', 'media', 'parts', 'wanted', 'service', 'bulk']

type Params = Record<string, string | string[] | undefined>

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * 가격 파라미터를 읽는다.
 *
 * 숫자가 아닌 값은 **없는 것으로 취급한다.** 예전에는 `max=abc` 가
 * 숫자만 남기는 처리를 거쳐 빈 문자열 → Number('') === 0 → `maxPrice: 0` 이 되었고,
 * 그 결과 깨진 URL 하나로 검색 결과가 전부 사라졌다. 조용한 빈 화면이 가장 나쁘다.
 */
function num(v: string | string[] | undefined): number | undefined {
  const raw = one(v)?.trim()
  if (!raw) return undefined
  // 콤마는 허용(120,000), 그 외 숫자 아닌 문자가 섞이면 신뢰하지 않는다
  if (!/^\d[\d,]*$/.test(raw)) return undefined
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function list<T extends string>(v: string | string[] | undefined, allowed: T[]): T[] | undefined {
  const s = one(v)
  if (!s) return undefined
  const out = s.split(',').map((x) => x.trim()).filter((x): x is T => (allowed as string[]).includes(x))
  return out.length ? out : undefined
}

/** URL 쿼리 → 검색 질의. 신뢰할 수 없는 입력이므로 전부 화이트리스트로 거른다. */
export function parseSearchParams(params: Params): SearchQuery {
  const filters: SearchFilters = {}
  let minPrice = num(params.min)
  let maxPrice = num(params.max)
  // 뒤집힌 구간은 사용자가 실수한 것이지 "0건을 보고 싶다"는 뜻이 아니다
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    ;[minPrice, maxPrice] = [maxPrice, minPrice]
  }
  if (minPrice !== undefined) filters.minPrice = minPrice
  if (maxPrice !== undefined) filters.maxPrice = maxPrice
  const sources = list(params.src, SOURCES)
  if (sources) filters.sources = sources
  const kinds = list(params.kind, KINDS)
  if (kinds) filters.kinds = kinds
  const region = one(params.region)?.trim()
  if (region) filters.region = region
  if (one(params.sold) === '1') filters.includeSold = true
  const withinDays = num(params.days)
  if (withinDays !== undefined && withinDays > 0 && withinDays <= 3650) filters.withinDays = withinDays

  const sortRaw = one(params.sort) as SortKey | undefined
  const q: SearchQuery = {
    q: (one(params.q) ?? '').slice(0, 100),
    sort: sortRaw && SORTS.includes(sortRaw) ? sortRaw : 'relevance',
    page: Math.max(1, Math.min(50, Number(one(params.page) ?? 1) || 1)),
    perPage: 24,
    filters,
  }
  const rs = one(params.in)
  if (rs) q.regionSlug = rs
  q.scope = one(params.scope) === 'overseas' ? 'overseas' : 'domestic'
  return q
}

export function scopeOf(params: Params): MarketScope {
  return one(params.scope) === 'overseas' ? 'overseas' : 'domestic'
}

/** 현재 조건에 일부만 바꾼 URL 을 만든다 (필터 칩이 링크로 동작하게) */
export function buildHref(base: Params, patch: Record<string, string | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(base)) {
    const s = one(v)
    if (s) sp.set(k, s)
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') sp.delete(k)
    else sp.set(k, v)
  }
  // 조건이 바뀌면 항상 1페이지로
  if (!('page' in patch)) sp.delete('page')
  const qs = sp.toString()
  return qs ? `/search?${qs}` : '/search'
}

/** 배열형 파라미터 토글 */
export function toggleInList(current: string | string[] | undefined, value: string): string | undefined {
  const cur = (one(current) ?? '').split(',').filter(Boolean)
  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]
  return next.length ? next.join(',') : undefined
}
