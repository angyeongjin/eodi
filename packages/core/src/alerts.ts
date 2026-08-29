import type { MergedListing, SearchFilters, MarketScope } from './types.js'

/**
 * 키워드 알림.
 *
 * "새 매물"을 어떻게 정의하느냐가 전부다.
 * 등록 시각으로 판단하면 안 된다 — 소스마다 시각 정책이 다르고(번개장터는 끌올할 때마다 갱신),
 * 메루카리처럼 시각을 아예 안 주는 소스도 있다. 그래서 **우리가 이미 보여준 적 있는 매물인가**로 본다.
 *
 * 그래서 알림 한 건마다 "이미 알린 매물 id"를 들고 다닌다. 단순하지만 소스 정책 변화에 흔들리지 않는다.
 */

/** 알림 하나가 기억하는 id 개수 상한. 넘으면 오래된 것부터 버린다. */
export const SEEN_CAP = 300
/** 한 번에 알릴 최대 매물 수. 더 많으면 "외 N건"으로 묶는다. */
export const MAX_PER_NOTIFICATION = 3

export interface AlertRule {
  id: number
  term: string
  scope: MarketScope
  filters: SearchFilters
  /** 이미 알린 매물 키 목록 */
  seenIds: string[]
}

export interface AlertMatch {
  rule: AlertRule
  /** 이번에 새로 나타난 매물 */
  fresh: MergedListing[]
  /** seenIds 에 저장할 새 목록 (상한 적용) */
  nextSeenIds: string[]
}

/**
 * 우리가 아는 푸시 서비스만 허용한다.
 *
 * 임의 URL 을 구독으로 받아두면, 나중에 우리 서버가 그 주소로 요청을 보내는 SSRF 통로가 된다.
 * (core 에 두는 이유: 웹 API 라우트도 검증이 필요한데, 발송 라이브러리까지 딸려 들어오면 안 된다)
 */
const ALLOWED_PUSH_HOSTS = [
  /\.googleapis\.com$/,               // Chrome / Android (FCM)
  /\.push\.services\.mozilla\.com$/,   // Firefox
  /\.notify\.windows\.com$/,          // Edge (레거시)
  /\.push\.apple\.com$/,              // Safari / iOS
  /\.pushservice\.microsoft\.com$/,
]

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:') return false
    return ALLOWED_PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

export function listingKey(l: { source: string; sourceItemId: string }): string {
  return `${l.source}:${l.sourceItemId}`
}

/**
 * 검색 결과에서 아직 알리지 않은 매물을 골라낸다.
 *
 * 처음 등록한 알림은 **아무것도 알리지 않는다.** 등록하자마자 기존 매물 50건이
 * 쏟아지면 그건 알림이 아니라 스팸이다. 첫 실행은 현재 목록을 "이미 본 것"으로 기록만 한다.
 */
export function diffAlert(
  rule: AlertRule,
  items: readonly MergedListing[],
  { firstRun = false }: { firstRun?: boolean } = {},
): AlertMatch {
  const seen = new Set(rule.seenIds)
  const currentKeys = items.map(listingKey)

  const fresh = firstRun ? [] : items.filter((l) => !seen.has(listingKey(l)))

  // 새 것을 앞에 두고 상한을 넘으면 오래된 기억부터 버린다
  const nextSeenIds = [...new Set([...currentKeys, ...rule.seenIds])].slice(0, SEEN_CAP)

  return { rule, fresh, nextSeenIds }
}

export interface NotificationPayload {
  title: string
  body: string
  url: string
  tag: string
}

const won = (n: number) => n.toLocaleString('ko-KR')

/** 알림 문구. 첫 줄에 몇 건인지, 둘째 줄에 가장 싼 매물을 넣는다. */
export function buildNotification(match: AlertMatch, siteUrl: string): NotificationPayload | null {
  const { rule, fresh } = match
  if (fresh.length === 0) return null

  const cheapest = [...fresh].sort((a, b) => a.priceKrw - b.priceKrw)[0]!
  const priceText =
    cheapest.currency === 'JPY'
      ? `¥${won(cheapest.price)} (약 ${won(Math.round(cheapest.priceKrw / 100) * 100)}원)`
      : `${won(cheapest.price)}원`

  const shown = fresh.slice(0, MAX_PER_NOTIFICATION)
  const more = fresh.length - shown.length

  const params = new URLSearchParams({ q: rule.term })
  if (rule.scope === 'overseas') params.set('scope', 'overseas')

  return {
    title: `${rule.term} 새 매물 ${fresh.length}건`,
    body:
      `${priceText} · ${cheapest.title.slice(0, 40)}` +
      (more > 0 ? `\n외 ${more}건 더` : ''),
    url: `${siteUrl.replace(/\/$/, '')}/search?${params.toString()}`,
    // 같은 알림 규칙의 푸시는 하나로 덮어쓴다. 알림창이 쌓이면 사람은 전부 꺼버린다.
    tag: `alert-${rule.id}`,
  }
}

/** 사용자가 만든 알림 조건을 사람이 읽을 수 있는 한 줄로 */
export function describeAlert(rule: Pick<AlertRule, 'term' | 'scope' | 'filters'>): string {
  const parts: string[] = [rule.scope === 'overseas' ? '일본' : '국내']
  const f = rule.filters
  if (f.maxPrice !== undefined) parts.push(`${won(f.maxPrice)}원 이하`)
  if (f.minPrice !== undefined) parts.push(`${won(f.minPrice)}원 이상`)
  if (f.sources?.length) parts.push(`${f.sources.length}개 마켓`)
  if (f.region) parts.push(f.region)
  return parts.join(' · ')
}
