/** 마켓 소스 식별자 */
export type SourceId =
  | 'bunjang' | 'daangn' | 'joongna' | 'hellomarket'
  | 'yahoo_auction' | 'mercari'

export const SOURCE_LABEL: Record<SourceId, string> = {
  bunjang: '번개장터',
  daangn: '당근마켓',
  joongna: '중고나라',
  hellomarket: '헬로마켓',
  yahoo_auction: '야후옥션',
  mercari: '메루카리',
}

/**
 * 국내 / 해외.
 *
 * 해외 매물은 구매대행 수수료·국제배송·관세가 붙어 표시가가 지불액이 아니다.
 * 그래서 같은 목록에 섞지 않고 탭으로 나눈다. 섞으면 "일본이 싸다"는 착각을 준다.
 */
export type MarketScope = 'domestic' | 'overseas'

export const SOURCE_SCOPE: Record<SourceId, MarketScope> = {
  bunjang: 'domestic',
  daangn: 'domestic',
  joongna: 'domestic',
  hellomarket: 'domestic',
  yahoo_auction: 'overseas',
  mercari: 'overseas',
}

export const SCOPE_LABEL: Record<MarketScope, string> = {
  domestic: '국내',
  overseas: '일본',
}

export type Currency = 'KRW' | 'JPY'

export const CURRENCY_SYMBOL: Record<Currency, string> = { KRW: '원', JPY: '¥' }

/** 어댑터가 마켓에서 막 긁어온 원본 매물 */
export interface RawListing {
  source: SourceId
  /** 소스 내 고유 ID */
  sourceItemId: string
  title: string
  /** 원본 통화 기준 금액. 정수. */
  price: number
  /** 미지정이면 KRW */
  currency?: Currency
  url: string
  /** 시·군·구·동 수준 텍스트 */
  region?: string
  /** 소스가 알려준 등록/갱신 시각 */
  postedAt?: Date
  /** 판매완료 */
  sold?: boolean
  /** 사업자/전문판매자 */
  proSeller?: boolean
  /** 소스 내 판매자 식별자. 한 판매자가 목록을 도배하는 것을 막는 데 쓴다 */
  sellerId?: string
  /** 원본 썸네일 URL. 우리가 호스팅하지 않고 링크만 쓴다 */
  thumbnailUrl?: string
  /**
   * 정가 판매인지 경매인지.
   * 경매의 price 는 "현재 입찰가"라 확정 가격이 아니다 — 1엔 시작 매물이 흔하다.
   * 화면에서 반드시 구분해 보여줘야 사용자를 오도하지 않는다.
   */
  listingType?: 'fixed' | 'auction'
  /** 경매 마감 시각 */
  endsAt?: Date
  /** 입찰 수 (경매) */
  bidCount?: number
  /** 배송비. 원본 통화 기준. 해외 매물은 이게 총지출의 큰 부분이라 감추면 안 된다 */
  shippingFee?: number
}

/**
 * 글의 종류.
 * 검색 서비스에서 이건 "거르는 기준"이 아니라 **라벨**이다.
 * 케이스를 찾는 사람에게 케이스는 노이즈가 아니다.
 */
export type ListingKind =
  | 'item'      // 본품 판매글
  | 'accessory' // 케이스·필름 등 부속품
  | 'media'     // 게임 타이틀·소프트웨어 등 콘텐츠 (본체가 아님)
  | 'parts'     // 부품·파손품
  | 'wanted'    // 매입합니다 / 삽니다 — 판매글이 아님
  | 'service'   // 대여·수리·개통 등 서비스
  | 'bulk'      // 대량·도매

export const KIND_LABEL: Record<ListingKind, string> = {
  item: '판매글',
  accessory: '액세서리',
  media: '게임·타이틀',
  parts: '부품·파손',
  wanted: '삽니다·매입',
  service: '대여·서비스',
  bulk: '대량·도매',
}

/** 기본 검색 결과에서 감추는 종류 */
export const HIDDEN_BY_DEFAULT: ListingKind[] = ['wanted', 'service']

/**
 * 가격 이상 신호.
 * 검색 서비스는 매물을 지우지 않는다. 대신 표시하고 순위를 낮춘다.
 */
export type PriceFlag = 'free' | 'too-low' | 'too-high'

export const PRICE_FLAG_LABEL: Record<PriceFlag, string> = {
  free: '나눔',
  'too-low': '가격 확인 필요',
  'too-high': '시세보다 매우 높음',
}

/** 정규화·분류를 마친 매물 */
export interface EnrichedListing extends RawListing {
  /** 매칭된 표준 제품 id. 못 찾으면 null */
  productId: string | null
  variant: VariantAttrs
  kind: ListingKind
  /** 분류 근거 키워드 (디버깅·설명용) */
  kindHit: string | null
  /** 제품 매칭 신뢰도 0~1 */
  matchScore: number
  /** 제목 정규화 결과 캐시 — 랭킹·중복판별에서 재계산하지 않도록 */
  normTitle: string
  /** 가격이 상식적인 범위를 벗어난 경우의 표시 */
  priceFlag: PriceFlag | null
  /**
   * 원화 환산가. 필터·정렬·중복판별은 전부 이 값을 쓴다.
   * 통화가 섞인 목록에서 원본 price 로 비교하면 ¥2,000 이 2,000원처럼 취급된다.
   */
  priceKrw: number
  /** 이 매물이 국내인지 해외인지 */
  scope: MarketScope
  /** 가품·개조·예약 등 구매 전에 알아야 할 신호 */
  warnings: ListingWarning[]
}

/** 교차 마켓 중복이 병합된 결과 카드 */
export interface MergedListing extends EnrichedListing {
  /** 이 카드가 대표하는 마켓들 (대표 매물 포함) */
  sources: SourceId[]
  /** 대표가 아닌 동일 매물들 */
  duplicates: EnrichedListing[]
  /** 랭킹 점수 */
  score: number
}

export interface VariantAttrs {
  /** 저장용량 GB. 1TB = 1024 */
  storageGb?: number
  color?: string
  /** 상태 등급 S/A/B/C */
  grade?: string
  sealed?: boolean
}

/** 표준 제품 카탈로그 항목 — 질의 이해와 패싯에 쓴다 */
export interface CatalogProduct {
  id: string
  slug: string
  brand: string
  name: string
  nameEn?: string
  category: CategoryId
  releasedAt?: string
  /** 출시가(KRW). 가격 필터 기본 구간 제안에 쓴다 */
  msrp?: number
  match: { require: string[][]; exclude?: string[] }
  aliases?: string[]
  storages?: number[]
}

export type CategoryId =
  | 'smartphone' | 'tablet' | 'laptop' | 'earbuds' | 'watch'
  | 'console' | 'camera' | 'monitor' | 'audio' | 'etc'

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  smartphone: '스마트폰',
  tablet: '태블릿',
  laptop: '노트북',
  earbuds: '이어폰·헤드폰',
  watch: '스마트워치',
  console: '게임기',
  camera: '카메라',
  monitor: '모니터',
  audio: '오디오',
  etc: '기타',
}

import type { ListingWarning } from './warnings.js'

export type SortKey = 'relevance' | 'recent' | 'price_asc' | 'price_desc'

export const SORT_LABEL: Record<SortKey, string> = {
  relevance: '정확도순',
  recent: '최신순',
  price_asc: '낮은 가격순',
  price_desc: '높은 가격순',
}

export interface SearchFilters {
  minPrice?: number
  maxPrice?: number
  sources?: SourceId[]
  /** 노출할 글 종류. 미지정이면 기본 규칙 적용 */
  kinds?: ListingKind[]
  /** 지역 문자열 부분일치 */
  region?: string
  /** 판매완료 포함 여부 */
  includeSold?: boolean
  /** 등록 후 경과일 상한 */
  withinDays?: number
  /** 색상. variant 추출값(black, space-gray …) 기준 */
  colors?: string[]
}

export interface SearchQuery {
  q: string
  /** 어느 시장을 볼지. 기본 국내 */
  scope?: MarketScope
  sort?: SortKey
  page?: number
  perPage?: number
  filters?: SearchFilters
  /** 지역 스코프가 있는 소스(당근)에서 볼 지역. 미지정 시 기본 지역 */
  regionSlug?: string
}

/** 패싯 집계 — 필터 UI가 개수를 보여줄 수 있도록 */
export interface Facets {
  sources: Array<{ id: SourceId; count: number }>
  kinds: Array<{ id: ListingKind; count: number }>
  regions: Array<{ name: string; count: number }>
  /** 제목에서 뽑은 색상. 굿즈는 한정색이, 전자기기는 색상이 곧 구매 조건이다 */
  colors: Array<{ id: string; label: string; count: number }>
  priceBuckets: Array<{ from: number; to: number | null; count: number }>
}

export interface SourceStatus {
  source: SourceId
  ok: boolean
  count: number
  durationMs: number
  error?: string
  /** 캐시에서 나온 결과인지 */
  cached?: boolean
  /** 이 소스가 지역 스코프라면 어느 지역을 봤는지 */
  regionLabel?: string
  /**
   * 정책상 꺼둔 소스인지.
   * 장애(ok=false)와 구분해야 한다 — 사용자에게 "고장났다"고 잘못 알리면 신뢰를 잃는다.
   */
  disabled?: boolean
}

export interface SearchResponse {
  query: string
  /** 질의 해석 결과 */
  interpreted: InterpretedQuery
  items: MergedListing[]
  total: number
  page: number
  perPage: number
  sort: SortKey
  facets: Facets
  sources: SourceStatus[]
  /** 전체 결과가 캐시에서 나왔는지 */
  cached: boolean
  tookMs: number
  /** 우리 인덱스에서 보강한 매물 수 */
  fromIndex: number
  /** 실시간 조회가 전부 실패해 저장된 인덱스만으로 답했는지 */
  indexOnly: boolean
  /** 이번 검색이 본 시장 */
  scope: MarketScope
  /** 원화 환산에 쓴 환율과 기준 시각 */
  fx?: { jpyToKrw: number; asOf: string }
  /** 이번 검색에 적용된 지역 */
  regionSlug?: string
}

export interface InterpretedQuery {
  /** 원문 */
  raw: string
  /** 해외 검색에 실제로 보낸 일본어 검색어. 번역 못 했으면 null */
  overseasTerm?: string | null
  /** 번역에 쓰인 사전 항목 (사용자에게 근거를 보여주기 위함) */
  translationHits?: Array<{ ko: string; ja: string }>
  /** 사전에 없어 못 옮긴 한글 조각. 사전 보강 대상으로 로깅한다 */
  untranslated?: string[]
  /** 정규화된 검색어 */
  normalized: string
  tokens: string[]
  /** 인식된 표준 제품 */
  productId: string | null
  productName?: string
  category?: CategoryId
  /** 질의에서 뽑아낸 가격 조건 */
  minPrice?: number
  maxPrice?: number
  /** 질의에서 뽑아낸 용량 */
  storageGb?: number
  /** 가격 조건 등을 걷어낸, 마켓에 실제로 보낼 검색어 */
  searchTerm: string
}
