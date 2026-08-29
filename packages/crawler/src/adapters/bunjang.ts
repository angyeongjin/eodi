import type { RawListing } from '@eodi/core'
import { fetchJson } from '../http.js'
import type { AdapterSearchOptions, SourceAdapter } from '../types.js'

/**
 * 번개장터.
 * 웹 검색 화면이 그대로 호출하는 공개 JSON 엔드포인트를 사용한다.
 * robots.txt 는 /login, /apps, /talk2 만 막고 나머지는 허용한다.
 */
const ENDPOINT = 'https://api.bunjang.co.kr/api/1/find_v2.json'
const NO_THUMBS = process.env.DISABLE_THUMBNAILS === '1'
const PAGE_SIZE = 100

interface BunjangItem {
  pid: string
  name: string
  price: string
  status: string
  product_image?: string
  ad: boolean
  location: string
  update_time: number
  used: number
  proshop: boolean
  bizseller: boolean
  uid?: string | number
}

interface BunjangResponse {
  result: string
  list?: BunjangItem[]
  no_result?: boolean
}

function toListing(it: BunjangItem): RawListing | null {
  const price = Number(it.price)
  if (!it.pid || !it.name || !Number.isFinite(price)) return null
  const listing: RawListing = {
    source: 'bunjang',
    sourceItemId: String(it.pid),
    title: it.name,
    price: Math.round(price),
    url: `https://m.bunjang.co.kr/products/${it.pid}`,
    sold: it.status !== '0',
  }
  if (it.location) listing.region = it.location
  if (Number.isFinite(it.update_time) && it.update_time > 0) {
    listing.postedAt = new Date(it.update_time * 1000)
  }
  if (it.proshop || it.bizseller) listing.proSeller = true
  if (it.uid !== undefined && it.uid !== null && it.uid !== '') listing.sellerId = String(it.uid)
  // 번개장터 이미지 URL은 {cnt}/{res} 자리표시자를 갖는다. 재호스팅하지 않고 링크만 쓴다.
  if (it.product_image && !NO_THUMBS) {
    listing.thumbnailUrl = it.product_image.replace('{cnt}', '1').replace('{res}', '360')
  }
  return listing
}

export const bunjangAdapter: SourceAdapter = {
  id: 'bunjang',
  label: '번개장터',
  enabled: true,

  async search(keyword, opts: AdapterSearchOptions = {}) {
    const limit = opts.limit ?? 200
    const maxRequests = Math.max(1, opts.maxRequests ?? 1)
    const order = opts.sort === 'relevance' ? 'score' : 'date'
    const out: RawListing[] = []

    for (let page = 0; out.length < limit && page < maxRequests; page++) {
      const url =
        `${ENDPOINT}?q=${encodeURIComponent(keyword)}` +
        `&page=${page}&n=${PAGE_SIZE}&order=${order}&req_ref=search&stat_device=w`

      const res = await fetchJson<BunjangResponse>(url, {
        skipRobots: false,
        ...(opts.signal ? { signal: opts.signal } : {}),
      })
      const list = res.list ?? []
      if (list.length === 0) break

      for (const it of list) {
        // 광고 슬롯은 검색어와 무관한 매입 업체 글이 대부분이라 아예 받지 않는다
        if (it.ad) continue
        const l = toListing(it)
        if (l) out.push(l)
        if (out.length >= limit) break
      }
      if (list.length < PAGE_SIZE) break
    }
    return out
  },
}
