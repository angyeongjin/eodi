import type { RawListing } from '@eodi/core'
import { fetchText } from '../http.js'
import { readNextDataJson } from '../parse.js'
import type { AdapterSearchOptions, SourceAdapter } from '../types.js'

/**
 * 헬로마켓.
 *
 * 검색 결과가 Next.js Pages Router 의 `__NEXT_DATA__` 안에 통째로 들어 있다.
 * robots.txt 는 Disallow 가 하나도 없다 — 전면 허용이다.
 *
 * 다른 소스와 달리 **지역 정보를 주지 않는다.** 없는 값을 지어내지 않고 그대로 비워 둔다.
 */
const BASE = 'https://www.hellomarket.com'
const PAGE_SIZE = 30

interface HelloItem {
  itemIdx: number
  title: string
  price: number
  imageUrl?: string
  /** epoch milliseconds */
  timestamp?: number
  sellState?: { code?: string; name?: string }
  usedType?: { code?: string; name?: string }
}

interface HelloNextData {
  props?: {
    initialState?: {
      searchData?: {
        itemList?: HelloItem[]
        itemTotalCount?: number
      }
    }
  }
}

function toListing(it: HelloItem): RawListing | null {
  if (!it?.itemIdx || !it.title || !Number.isFinite(it.price)) return null

  const listing: RawListing = {
    source: 'hellomarket',
    sourceItemId: String(it.itemIdx),
    title: it.title,
    price: Math.round(it.price),
    url: `${BASE}/item/${it.itemIdx}`,
    sold: it.sellState?.code !== undefined && it.sellState.code !== 'ForSale',
  }

  if (typeof it.timestamp === 'number' && it.timestamp > 0) {
    const d = new Date(it.timestamp)
    if (!Number.isNaN(d.getTime())) listing.postedAt = d
  }
  if (it.imageUrl && process.env.DISABLE_THUMBNAILS !== '1') listing.thumbnailUrl = it.imageUrl

  return listing
}

/** 검색 결과 페이지 HTML → 원본 매물 */
export function parseHellomarketHtml(html: string): RawListing[] {
  const data = readNextDataJson<HelloNextData>(html)
  const items = data?.props?.initialState?.searchData?.itemList
  if (!Array.isArray(items)) return []

  const out: RawListing[] = []
  for (const it of items) {
    const l = toListing(it)
    if (l) out.push(l)
  }
  return out
}

export const hellomarketAdapter: SourceAdapter = {
  id: 'hellomarket',
  label: '헬로마켓',
  enabled: true,

  async search(keyword, opts: AdapterSearchOptions = {}) {
    const limit = opts.limit ?? 100
    const maxRequests = Math.max(1, opts.maxRequests ?? 1)
    const out: RawListing[] = []
    const seen = new Set<string>()

    for (let page = 1; out.length < limit && page <= maxRequests; page++) {
      const url =
        `${BASE}/search?q=${encodeURIComponent(keyword)}` + (page > 1 ? `&page=${page}` : '')
      const html = await fetchText(url, opts.signal ? { signal: opts.signal } : {})
      const rows = parseHellomarketHtml(html)
      if (rows.length === 0) break

      for (const r of rows) {
        if (seen.has(r.sourceItemId)) continue
        seen.add(r.sourceItemId)
        out.push(r)
        if (out.length >= limit) break
      }
      if (rows.length < PAGE_SIZE) break
    }
    return out
  },
}
