import type { RawListing } from '@eodi/core'
import { fetchText } from '../http.js'
import { extractJsonArray, readNextFlightPayload } from '../parse.js'
import type { AdapterSearchOptions, SourceAdapter } from '../types.js'

/**
 * 중고나라.
 *
 * 내부 검색 API(`search-api.joongna.com`)는 404 다 — 막힌 게 아니라 우리가 알던 경로가 없어졌다.
 * 대신 검색 결과 **페이지 자체가 서버에서 렌더**되고, 매물 목록이 RSC 페이로드에 들어 있다.
 * robots.txt 는 `/my-account`, `/signin`, `/product/form` 등만 막고 `/search` 는 명시적으로 허용한다.
 * 그래서 사람이 보는 것과 같은 페이지를 그대로 읽는다.
 */
const BASE = 'https://web.joongna.com'
const PAGE_SIZE = 50

interface JoongnaItem {
  seq: number
  title: string
  price: number
  /** 썸네일 이미지 주소. 매물 링크가 아니다 */
  url?: string
  /** 0 = 판매중 */
  state?: number
  /** "2026-08-29 14:38:55" — 한국시간 */
  sortDate?: string
  mainLocationName?: string
  locationNames?: string[]
  storeSeq?: number
  userType?: number
  certifySellerFlag?: boolean
}

/** "2026-08-29 14:38:55" (KST) → Date. 타임존을 안 붙이면 서버 로컬시간으로 9시간 어긋난다. */
function parseKstDate(s: string | undefined): Date | undefined {
  if (!s) return undefined
  const d = new Date(`${s.replace(' ', 'T')}+09:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function toListing(it: JoongnaItem): RawListing | null {
  if (!it?.seq || !it.title || !Number.isFinite(it.price)) return null

  const listing: RawListing = {
    source: 'joongna',
    sourceItemId: String(it.seq),
    title: it.title,
    price: Math.round(it.price),
    url: `${BASE}/product/${it.seq}`,
    sold: it.state !== undefined && it.state !== 0,
  }

  const region = it.locationNames?.[0] ?? it.mainLocationName
  if (region) listing.region = region

  const postedAt = parseKstDate(it.sortDate)
  if (postedAt) listing.postedAt = postedAt

  if (it.storeSeq) listing.sellerId = String(it.storeSeq)
  if (it.certifySellerFlag || (it.userType !== undefined && it.userType !== 0)) listing.proSeller = true
  if (it.url && process.env.DISABLE_THUMBNAILS !== '1') listing.thumbnailUrl = it.url

  return listing
}

/** 검색 결과 페이지 HTML → 원본 매물 */
export function parseJoongnaHtml(html: string): RawListing[] {
  const payload = readNextFlightPayload(html)
  if (!payload) return []
  const raw = extractJsonArray(payload, 'items')
  if (!raw) return []

  let arr: JoongnaItem[]
  try {
    arr = JSON.parse(raw) as JoongnaItem[]
  } catch {
    return []
  }

  const out: RawListing[] = []
  for (const it of arr) {
    const l = toListing(it)
    if (l) out.push(l)
  }
  return out
}

export const joongnaAdapter: SourceAdapter = {
  id: 'joongna',
  label: '중고나라',
  enabled: true,

  async search(keyword, opts: AdapterSearchOptions = {}) {
    const limit = opts.limit ?? 100
    const maxRequests = Math.max(1, opts.maxRequests ?? 1)
    const out: RawListing[] = []
    const seen = new Set<string>()

    for (let page = 1; out.length < limit && page <= maxRequests; page++) {
      const url =
        `${BASE}/search/${encodeURIComponent(keyword)}` + (page > 1 ? `?page=${page}` : '')
      const html = await fetchText(url, opts.signal ? { signal: opts.signal } : {})
      const rows = parseJoongnaHtml(html)
      if (rows.length === 0) break

      for (const r of rows) {
        // 페이지 간에 같은 매물이 겹쳐 나오는 경우가 있다
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
