import type { RawListing } from '@eodi/core'
import type { SourceAdapter } from '../types.js'

/**
 * 메루카리.
 *
 * 실시간 연합검색 소스가 **아니다.**
 * 메루카리는 검색 결과를 서버에서 렌더하지 않고, 유일한 데이터 경로인 API 는
 * `401 unauthorized: missing auth token` 을 돌려준다. 즉 HTTP 요청만으로는 읽을 수 없다.
 * 남은 방법은 브라우저로 페이지를 실제로 띄우는 것인데, 사용자 요청마다 그러기엔
 * 느리고(수 초) 무겁다.
 *
 * 그래서 메루카리는 **백그라운드 수집 전용 소스**다.
 *   - `crawl-mercari` CLI 가 헤드리스 브라우저로 굿즈 키워드를 돌며 우리 인덱스에 적재하고
 *   - 검색은 그 인덱스에서 결과를 꺼내 쓴다 (service 의 인덱스 보강 경로)
 *
 * 그래서 이 어댑터의 search() 는 항상 빈 배열을 돌려준다. 껍데기가 아니라 의도된 설계다.
 */
export const mercariAdapter: SourceAdapter = {
  id: 'mercari',
  label: '메루카리',
  scope: 'overseas',
  enabled: false,
  disabledReason:
    '실시간 조회를 지원하지 않는 마켓입니다. 주기적으로 수집한 매물을 보여줍니다.',

  async search(): Promise<RawListing[]> {
    return []
  },
}

/** 크롤러가 만든 아이템을 RawListing 으로 */
export interface MercariScraped {
  id: string
  title: string
  /** 엔화 */
  price: number
  sold: boolean
  thumbnailUrl?: string
}

export function toMercariListing(it: MercariScraped): RawListing | null {
  if (!it.id || !it.title || !Number.isFinite(it.price) || it.price <= 0) return null
  const listing: RawListing = {
    source: 'mercari',
    sourceItemId: it.id,
    title: it.title,
    price: Math.round(it.price),
    currency: 'JPY',
    url: `https://jp.mercari.com/item/${it.id}`,
    sold: it.sold,
    listingType: 'fixed',
  }
  if (it.thumbnailUrl && process.env.DISABLE_THUMBNAILS !== '1') listing.thumbnailUrl = it.thumbnailUrl
  return listing
}
