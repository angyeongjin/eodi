import {
  ProductMatcher, CATALOG, interpretQuery, buildSearchResult, translateToJapanese,
  getFxRate, tokenize, suggestGoodsTerms, goodsLabel, GOODS_KIND_LABEL,
  type SearchQuery, type SearchResponse, type SearchFilters, type SortKey,
  type RawListing, type SourceStatus, type CatalogProduct, type MarketScope,
} from '@eodi/core'
import {
  cacheKey, getCachedSearch, setCachedSearch, DEFAULT_TTL_MS, isCacheFresh, isCacheUsable,
  upsertListings, searchStoredListings, logQuery, recordSourceHealth, popularQueries,
  recordUntranslated,
} from '@eodi/db'
import { federate, type FederateOptions } from './federate.js'
import { DEFAULT_REGION_SLUG, findRegion } from './regions.js'
import { ensureFxRate } from './fx-refresh.js'

/** 카탈로그는 프로세스당 한 번만 만든다 */
let matcherInstance: ProductMatcher | null = null
export function matcher(): ProductMatcher {
  if (!matcherInstance) matcherInstance = new ProductMatcher(CATALOG as CatalogProduct[])
  return matcherInstance
}

export interface SearchOptions {
  /** 캐시를 무시하고 무조건 새로 수집 */
  refresh?: boolean
  ttlMs?: number
  federate?: FederateOptions
  /** 결과를 DB에 남길지 */
  persist?: boolean
  /**
   * 응답 이후로 미룰 작업을 받는 곳.
   *
   * 주면 매물 저장·캐시 쓰기·로그가 사용자 응답 경로에서 빠지고, 낡은 캐시를 뒤에서
   * 갱신하는 일도 여기로 간다. 안 주면 예전처럼 응답 전에 끝낸다 —
   * CLI·크론은 곧 프로세스가 끝나므로 기다리지 않으면 아무것도 저장되지 않는다.
   */
  defer?: (task: () => Promise<void>) => void
  /**
   * 사용자 요청이 아니라 뒤에서 도는 갱신인지.
   * 검색 로그·미번역 기록은 남기지 않는다 — 사용자가 한 번 검색한 것이 두 번으로 세지면
   * 클릭률 분모가 부풀고, 그 숫자로 랭킹과 제휴를 판단하게 된다.
   */
  background?: boolean
}

const PER_PAGE_MAX = 60

function clampPaging(q: SearchQuery): { page: number; perPage: number } {
  const perPage = Math.min(PER_PAGE_MAX, Math.max(1, q.perPage ?? 24))
  const page = Math.max(1, Math.floor(q.page ?? 1))
  return { page, perPage }
}

/**
 * 통합 검색.
 *
 * 캐시 → 연합수집 → (전멸 시) 우리 인덱스 폴백 순으로 매물을 확보한 뒤,
 * 정규화·중복병합·랭킹·필터를 거쳐 한 화면 분량으로 잘라 돌려준다.
 */
export async function search(query: SearchQuery, opts: SearchOptions = {}): Promise<SearchResponse> {
  const started = Date.now()
  const m = matcher()
  const raw = (query.q ?? '').trim()
  const interpreted = interpretQuery(raw, m)
  const { page, perPage } = clampPaging(query)
  const sort: SortKey = query.sort ?? 'relevance'
  const filters: SearchFilters = query.filters ?? {}
  const regionSlug = query.regionSlug ?? DEFAULT_REGION_SLUG
  const region = findRegion(regionSlug)
  const scope: MarketScope = query.scope ?? 'domestic'

  // 해외 매물은 원화 환산이 필요하다. 국내 검색에서는 네트워크를 쓰지 않는다.
  if (scope === 'overseas') await ensureFxRate()

  const emptyResult = (): SearchResponse => ({
    query: raw,
    interpreted,
    items: [],
    total: 0,
    page,
    perPage,
    sort,
    facets: { sources: [], kinds: [], regions: [], priceBuckets: [] },
    sources: [],
    cached: false,
    tookMs: Date.now() - started,
    fromIndex: 0,
    indexOnly: false,
    regionSlug,
    scope,
    fx: getFxRate(),
  })

  if (!interpreted.searchTerm) return emptyResult()

  /*
    해외 마켓은 한글 검색어에 0건을 준다. 굿즈 사전으로 일본어로 옮겨 보내고,
    옮기지 못하면 빈 결과 대신 "이 말은 아직 모른다"고 알린다(interpreted.overseasTerm === null).
    엉뚱한 일본어를 지어내 보내는 것보다 모른다고 말하는 편이 낫다.
  */
  let marketTerm = interpreted.searchTerm
  if (scope === 'overseas') {
    const tr = translateToJapanese(interpreted.searchTerm)
    interpreted.overseasTerm = tr.ja
    interpreted.translationHits = tr.hits.map((h) => ({ ko: h.ko, ja: h.ja }))
    interpreted.untranslated = tr.unresolved
    if (!tr.ja) {
      /*
        여기서 그냥 빠져나가면 아래 persistAfterSearch 를 통째로 건너뛴다.
        그런데 "한 단어도 못 옮긴 검색"이야말로 사전에 가장 먼저 넣어야 할 말이다.
        정작 배워야 할 단어만 기록되지 않고 있었다 — 부분 번역된 것만 남았다.
        빈 결과를 돌려주더라도 무엇을 몰랐는지는 남긴다.
      */
      if (opts.persist !== false && !opts.background) {
        const record = () => Promise.allSettled([
          recordUntranslated(tr.unresolved),
          logQuery({
            term: interpreted.raw,
            normalized: interpreted.normalized,
            productId: interpreted.productId,
            resultCount: 0,
            tookMs: Date.now() - started,
            cached: false,
            scope,
          }),
        ])
        // 사전 보강 신호는 사용자를 세워두지 않고 남긴다
        if (opts.defer) opts.defer(async () => { await record() })
        else await record()
      }
      return emptyResult()
    }
    marketTerm = tr.ja
    // 랭킹은 "실제로 마켓에 보낸 검색어" 기준이어야 한다.
    // 한글 토큰으로 일본어 제목을 채점하면 관련도가 전부 0이 된다.
    interpreted.tokens = tokenize(marketTerm)
  }

  // 필터는 우리가 로컬에서 적용하므로 캐시 키에서 제외한다 —
  // 그래야 같은 검색어의 필터 조작이 남의 서버를 다시 때리지 않는다.
  const key = cacheKey(marketTerm, { v: 4, r: regionSlug, s: scope })

  let listings: RawListing[] = []
  let statuses: SourceStatus[] = []
  let cached = false
  let fromIndex = 0
  let indexOnly = false

  let stale = false
  if (!opts.refresh) {
    const hit = await getCachedSearch(key)
    /*
      신선 기한이 지난 캐시라도, 뒤에서 갱신할 수단이 있으면 그대로 답한다.
      기다려서 얻는 차이는 대개 매물 몇 건이고, 잃는 것은 4초다.
      갱신할 수단이 없으면(CLI·크론) 낡은 답을 주지 않고 새로 수집한다.
    */
    const ttl = opts.ttlMs ?? DEFAULT_TTL_MS
    const fresh = hit ? isCacheFresh(hit.createdAt, ttl) : false
    // 낡은 답을 쓰더라도 상한은 지킨다. 상한을 넘겼으면 캐시가 없는 것과 같이 취급한다.
    const usable = hit ? fresh || (Boolean(opts.defer) && isCacheUsable(hit.createdAt, ttl)) : false
    if (hit && usable) {
      listings = hit.listings
      statuses = hit.sources.map((s) => ({ ...s, cached: true }))
      cached = true
      stale = !fresh
    }
  }

  if (!cached) {
    const result = await federate(marketTerm, { ...opts.federate, regionSlug, scope })
    listings = result.listings
    statuses = result.statuses

    /*
     * 우리 인덱스로 보강한다.
     * 당근은 지역 스코프라 실시간으로는 한 지역만 볼 수 있다.
     * 예열 크론이 여러 지역을 돌며 쌓아둔 매물을 여기서 합쳐 커버리지를 넓힌다.
     * 중복은 뒤에서 source+id 로 걸러지므로 그냥 이어 붙이면 된다.
     */
    const stored = await searchStoredListings(marketTerm, { limit: 200, freshDays: 14, scope })
    if (stored.length > 0) {
      const live = new Set(listings.map((l) => `${l.source}:${l.sourceItemId}`))
      const extra = stored.filter((l) => !live.has(`${l.source}:${l.sourceItemId}`))
      fromIndex = extra.length
      listings = listings.concat(extra)
    }

    // 실시간 조회가 전멸했는데 인덱스가 답을 줬다면 사용자에게 사실대로 알린다
    if (statuses.every((s) => !s.ok || s.disabled) && fromIndex > 0) {
      indexOnly = true
    }
  }

  if (region) {
    for (const s of statuses) {
      if (s.source === 'daangn') s.regionLabel = `${region.city} ${region.dong}`
    }
  }

  const built = buildSearchResult({
    interpreted, listings, matcher: m, sort, page, perPage, filters,
  })

  const response: SearchResponse = {
    query: raw,
    interpreted,
    items: built.items,
    total: built.total,
    page: built.page,
    perPage: built.perPage,
    sort: built.sort,
    facets: built.facets,
    sources: statuses,
    cached,
    stale,
    tookMs: Date.now() - started,
    fromIndex,
    indexOnly,
    regionSlug,
    scope,
    fx: getFxRate(),
  }

  if (opts.persist !== false) {
    const persist = () =>
      persistAfterSearch({
        cached, key, marketTerm, interpreted, listings, statuses, built, response, scope,
        background: opts.background === true,
      })
    if (opts.defer) opts.defer(persist)
    else await persist()
  }

  /*
    낡은 캐시로 답했으면 여기서 새로 받아 둔다. 이번 사용자는 이미 답을 받았고,
    이 갱신의 수혜자는 다음 사람이다. background 를 켜 검색 로그가 두 번 세지지 않게 한다.
  */
  if (stale && opts.defer) {
    opts.defer(async () => {
      await search(query, { ...opts, refresh: true, background: true, defer: undefined })
    })
  }

  return response
}

async function persistAfterSearch(args: {
  cached: boolean
  key: string
  /** 마켓에 실제로 보낸 검색어 (해외는 일본어) */
  marketTerm: string
  interpreted: SearchResponse['interpreted']
  listings: RawListing[]
  statuses: SourceStatus[]
  built: ReturnType<typeof buildSearchResult>
  response: SearchResponse
  /** 어느 탭의 검색이었는지 — 탭별 이용 비중을 세려면 로그에 남아야 한다 */
  scope: MarketScope
  /** 뒤에서 도는 갱신이면 검색 로그를 남기지 않는다 */
  background?: boolean
}): Promise<void> {
  const { cached, key, marketTerm, interpreted, listings, statuses, built, response } = args
  const tasks: Array<Promise<unknown>> = []
  if (!args.background) {
    tasks.push(
      logQuery({
        term: interpreted.raw,
        normalized: interpreted.normalized,
        productId: interpreted.productId,
        resultCount: response.total,
        tookMs: response.tookMs,
        cached,
        scope: args.scope,
      }),
    )
    if (interpreted.untranslated?.length) {
      tasks.push(recordUntranslated(interpreted.untranslated))
    }
  }
  if (!cached) {
    /*
      실패는 캐시하지 않는다.
      모든 소스가 죽은 순간의 결과를 10분간 물고 있으면, 소스가 곧바로 복구돼도
      사용자는 계속 열화된 목록을 보게 된다. 다음 요청이 다시 시도하게 두는 편이 낫다.
    */
    const anySourceAnswered = statuses.some((s) => s.ok)
    if (anySourceAnswered) {
      tasks.push(setCachedSearch(key, marketTerm, listings, statuses, DEFAULT_TTL_MS))
    }
    tasks.push(
      upsertListings(built.enriched),
      recordSourceHealth(statuses.filter((s) => s.durationMs > 0)),
    )
  }
  await Promise.allSettled(tasks)
}

export interface Suggestion {
  term: string
  /** 어디서 온 제안인지 */
  kind: 'goods' | 'product' | 'popular'
  /** 굿즈 사전 항목이면 일본어 표기 (사용자에게 "이렇게 찾습니다"를 미리 보여준다) */
  ja?: string
  /** 굿즈 사전 항목의 분류: 작품 / 캐릭터 / 종류 … */
  group?: string
  /** 해외 탭으로 보낼 제안인지 */
  scope?: 'domestic' | 'overseas'
  productSlug?: string
  category?: string
}

/**
 * 자동완성.
 *
 * 굿즈 사전을 **맨 앞에** 둔다. 이 서비스에 굿즈를 찾으러 온 사람에게
 * 전자기기 카탈로그가 먼저 뜨면 아무 도움이 안 된다.
 * 초성 입력("ㅈㅅㅎㅈ")도 사전 쪽에서 받는다.
 */
export async function suggest(prefix: string, limit = 8): Promise<Suggestion[]> {
  const q = (prefix ?? '').trim()
  const out: Suggestion[] = []
  const seen = new Set<string>()
  const push = (s: Suggestion) => {
    if (seen.has(s.term) || out.length >= limit) return
    seen.add(s.term)
    out.push(s)
  }

  if (q) {
    for (const t of suggestGoodsTerms(q, limit)) {
      push({
        term: goodsLabel(t),
        kind: 'goods',
        ja: t.ja,
        group: GOODS_KIND_LABEL[t.kind],
        scope: 'overseas',
      })
    }
    for (const p of matcher().suggest(q, limit)) {
      push({ term: p.name, kind: 'product', productSlug: p.slug, category: p.category, scope: 'domestic' })
    }
  }

  if (out.length < limit) {
    const popular = await popularQueries(limit * 2)
    const nq = q.toLowerCase()
    for (const p of popular) {
      if (q && !p.term.toLowerCase().includes(nq)) continue
      push({ term: p.term, kind: 'popular' })
    }
  }

  return out.slice(0, limit)
}
