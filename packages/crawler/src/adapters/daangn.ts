import type { RawListing } from '@eodi/core'
import { fetchText } from '../http.js'
import type { AdapterSearchOptions, SourceAdapter } from '../types.js'
import { DEFAULT_REGION_SLUG, findRegion } from '../regions.js'
import { extractJsonArray } from '../parse.js'

/**
 * 당근마켓.
 * 검색 결과 페이지에 검색엔진용으로 삽입된 구조화 데이터(fleamarketArticles / JSON-LD)만 읽는다.
 * robots.txt 는 /kr/buy-sell/s/ 를 막지만 우리가 쓰는 /kr/buy-sell/?search= 는 대상이 아니며,
 * 실제 요청은 http.ts 의 robots 검사를 그대로 통과해야 나간다.
 *
 * 당근 검색은 **지역 스코프**다. 지역이 다르면 결과가 거의 겹치지 않는다(실측 0%).
 * 그래서 실시간 검색은 지역 하나만 보고, 전국 커버리지는 예열 크론이 여러 지역을 돌며 채운다.
 */
const BASE = 'https://www.daangn.com'

interface DaangnArticle {
  id: string
  href: string
  title: string
  content?: string
  price: string
  status: string
  thumbnail?: string
  createdAt?: string
  region?: { name?: string } | null
}

/** 구조화 데이터 → 원본 매물 */
export function parseDaangnHtml(html: string): RawListing[] {
  const raw = extractJsonArray(html, 'fleamarketArticles')
  if (!raw) return []
  let arr: DaangnArticle[]
  try {
    arr = JSON.parse(raw) as DaangnArticle[]
  } catch {
    return []
  }

  const out: RawListing[] = []
  for (const a of arr) {
    if (!a?.href || !a.title) continue
    const price = Number(String(a.price ?? '').replace(/[^\d]/g, ''))
    if (!Number.isFinite(price)) continue
    // href 마지막 세그먼트 끝의 짧은 해시가 게시글 고유 ID
    const seg = a.href.replace(/\/+$/, '').split('/').pop() ?? a.href
    const id = seg.split('-').pop() || seg

    const listing: RawListing = {
      source: 'daangn',
      sourceItemId: id,
      title: a.title,
      price: Math.round(price),
      url: a.href.startsWith('http') ? a.href : BASE + a.href,
      sold: a.status !== undefined && a.status !== 'Ongoing',
    }
    const region = a.region?.name
    if (region) listing.region = region
    if (a.thumbnail && process.env.DISABLE_THUMBNAILS !== '1') listing.thumbnailUrl = a.thumbnail
    if (a.createdAt) {
      const d = new Date(a.createdAt)
      if (!Number.isNaN(d.getTime())) listing.postedAt = d
    }
    out.push(listing)
  }
  return out
}

export const daangnAdapter: SourceAdapter = {
  id: 'daangn',
  label: '당근마켓',
  enabled: true,

  async search(keyword, opts: AdapterSearchOptions = {}) {
    const limit = opts.limit ?? 200
    const slug = opts.regionSlug ?? DEFAULT_REGION_SLUG
    const region = findRegion(slug)
    const url =
      `${BASE}/kr/buy-sell/?search=${encodeURIComponent(keyword)}` +
      (region ? `&in=${encodeURIComponent(region.slug)}` : '')
    const html = await fetchText(url, opts.signal ? { signal: opts.signal } : {})
    return parseDaangnHtml(html).slice(0, limit)
  },
}
