export { formatMoney, formatApproxKrw } from '@eodi/core'

export function won(n: number): string {
  if (n === 0) return '나눔'
  return n.toLocaleString('ko-KR') + '원'
}

/** 만원 단위 축약 — 필터 칩처럼 좁은 곳에서 */
export function wonShort(n: number): string {
  if (n === 0) return '0'
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`
  return n.toLocaleString('ko-KR')
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 경매 마감까지 남은 시간. 지났으면 '마감' */
export function remainingTime(date: Date | string | undefined | null, now: Date = new Date()): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const ms = d.getTime() - now.getTime()
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return '마감'
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) return `${days}일 남음`
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `${hours}시간 남음`
  return `${Math.max(1, Math.floor(ms / 60_000))}분 남음`
}

export function relativeTime(date: Date | string | undefined | null, now: Date = new Date()): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const ms = now.getTime() - d.getTime()
  if (!Number.isFinite(ms)) return ''
  if (ms < MINUTE) return '방금'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}분 전`
  if (ms < DAY) return `${Math.floor(ms / HOUR)}시간 전`
  if (ms < 30 * DAY) return `${Math.floor(ms / DAY)}일 전`
  if (ms < 365 * DAY) return `${Math.floor(ms / (30 * DAY))}개월 전`
  return `${Math.floor(ms / (365 * DAY))}년 전`
}

/** "서울특별시 강남구 역삼동" → "강남구 역삼동" (앞의 시·도는 대개 군더더기) */
export function shortRegion(region: string | undefined): string {
  if (!region) return ''
  const parts = region.split(/\s+/).filter(Boolean)
  return parts.length > 2 ? parts.slice(1).join(' ') : region
}
