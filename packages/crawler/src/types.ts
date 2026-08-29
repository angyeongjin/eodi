import type { MarketScope, RawListing, SourceId } from '@eodi/core'

export interface AdapterSearchOptions {
  /** 최대 수집 건수 */
  limit?: number
  /** 정렬 기준 */
  sort?: 'recent' | 'relevance'
  /** 지역 스코프가 있는 소스(당근)용 지역 slug */
  regionSlug?: string
  /**
   * 이 소스에 보낼 최대 HTTP 요청 수.
   * 페이지를 더 넘기면 결과는 늘지만 레이트리밋 대기가 그대로 사용자 응답 지연이 된다.
   * 대화형 검색은 1, 백그라운드 예열은 더 크게 잡는다.
   */
  maxRequests?: number
  /** 호출자가 이 검색을 포기했을 때 진행 중인 요청까지 끊기 위한 신호 */
  signal?: AbortSignal
}

export interface SourceAdapter {
  readonly id: SourceId
  readonly label: string
  /** 국내/해외. 지정하지 않으면 국내로 본다 */
  readonly scope?: MarketScope
  /** 지금 쓸 수 있는 소스인지. 차단·정책 문제로 끌 수 있다 */
  readonly enabled: boolean
  /** 비활성 사유 (운영 화면에 노출) */
  readonly disabledReason?: string
  search(keyword: string, opts?: AdapterSearchOptions): Promise<RawListing[]>
}
