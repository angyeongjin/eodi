import type { RawListing } from '@eodi/core'
import { fetchText } from '../http.js'
import type { AdapterSearchOptions, SourceAdapter } from '../types.js'

/**
 * 야후옥션 (ヤフオク).
 *
 * 굿즈·피규어는 메루카리와 함께 일본의 양대 채널이고, 오래된·희귀 물건은 이쪽이 더 많다.
 * 검색 결과가 서버 렌더 HTML 이고 상품 정보가 전부 `data-auction-*` 속성에 들어 있어
 * 자바스크립트 실행 없이 그대로 읽힌다.
 *
 * robots.txt 는 /search/advanced, /closedsearch 등을 막지만 /search/search 는 허용한다.
 */
const BASE = 'https://auctions.yahoo.co.jp'
const PAGE_SIZE = 50

/** 목록 카드 하나 = Product__imageLink 앵커 하나 */
const CARD = /<a\s+class="Product__imageLink[\s\S]{0,4000}?<\/a>/g

function attr(block: string, name: string): string | null {
  const m = block.match(new RegExp(`data-auction-${name}="([^"]*)"`))
  return m?.[1] ?? null
}

/** data-cl-params 는 `key:value;key:value` 형태의 로깅 파라미터인데 시작·종료 시각이 들어 있다 */
function clParams(block: string): Record<string, string> {
  const m = block.match(/data-cl-params="([^"]*)"/)
  if (!m?.[1]) return {}
  const out: Record<string, string> = {}
  for (const kv of m[1].split(';')) {
    const at = kv.indexOf(':')
    if (at > 0) out[kv.slice(0, at)] = kv.slice(at + 1)
  }
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function epochToDate(v: string | undefined): Date | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined
  const d = new Date(Number(v) * 1000)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** 검색 결과 페이지 HTML → 원본 매물 */
export function parseYahooHtml(html: string): RawListing[] {
  const out: RawListing[] = []
  const seen = new Set<string>()

  for (const m of html.matchAll(CARD)) {
    const block = m[0]
    const id = attr(block, 'id')
    const title = attr(block, 'title')
    const priceRaw = attr(block, 'price')
    if (!id || !title || !priceRaw) continue
    if (seen.has(id)) continue

    const price = Number(priceRaw.replace(/[^\d]/g, ''))
    if (!Number.isFinite(price)) continue
    seen.add(id)

    const cl = clParams(block)
    // isflea 가 채워져 있으면 프리마(정가 판매), 비어 있으면 경매
    const isFlea = (attr(block, 'isflea') ?? '') !== ''

    const listing: RawListing = {
      source: 'yahoo_auction',
      sourceItemId: id,
      title: decodeEntities(title),
      price: Math.round(price),
      currency: 'JPY',
      url: `https://page.auctions.yahoo.co.jp/jp/auction/${id}`,
      sold: false,
      listingType: isFlea ? 'fixed' : 'auction',
    }

    const img = attr(block, 'img')
    if (img && process.env.DISABLE_THUMBNAILS !== '1') listing.thumbnailUrl = decodeEntities(img)

    const startedAt = epochToDate(cl['st'])
    if (startedAt) listing.postedAt = startedAt
    const endsAt = epochToDate(cl['end'])
    if (endsAt) listing.endsAt = endsAt

    /*
      cpsf 는 즉시구매가가 아니라 **배송비**다(화면의 "＋送料1,280円").
      처음에 즉시구매가로 착각해 현재가보다 싼 "즉결가"를 표시할 뻔했다.
      해외 매물은 배송비가 총지출의 큰 부분이라 그대로 노출한다.
    */
    const shipping = Number(cl['cpsf'] ?? '')
    if (Number.isFinite(shipping) && shipping > 0) listing.shippingFee = Math.round(shipping)

    // etc:"p=41,b=3,..." 에서 b 가 입찰 수
    const bids = cl['etc']?.match(/(?:^|,)b=(\d+)/)
    if (bids?.[1]) listing.bidCount = Number(bids[1])

    out.push(listing)
  }
  return out
}

export const yahooAuctionAdapter: SourceAdapter = {
  id: 'yahoo_auction',
  label: '야후옥션',
  scope: 'overseas',
  enabled: true,

  async search(keyword, opts: AdapterSearchOptions = {}) {
    const limit = opts.limit ?? 100
    const maxRequests = Math.max(1, opts.maxRequests ?? 1)
    const out: RawListing[] = []
    const seen = new Set<string>()

    for (let page = 0; out.length < limit && page < maxRequests; page++) {
      // b 는 1부터 시작하는 오프셋이다 (2페이지 = 51)
      const offset = page * PAGE_SIZE + 1
      const url =
        `${BASE}/search/search?p=${encodeURIComponent(keyword)}` +
        `&n=${PAGE_SIZE}` + (offset > 1 ? `&b=${offset}` : '')

      const html = await fetchText(url, opts.signal ? { signal: opts.signal } : {})
      const rows = parseYahooHtml(html)
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
