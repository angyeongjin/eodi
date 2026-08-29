import type { Currency } from './types.js'

/**
 * 환율.
 *
 * 환율 때문에 검색이 실패하면 안 된다. 그래서 3단 구조로 둔다.
 *   1) 갱신된 실제 환율  2) 마지막 성공값  3) 하드코딩 기본값
 * 네트워크 조회는 여기서 하지 않는다 — core 는 I/O 를 모른다.
 */

/** 2026-08 기준 대략값. 조회가 전부 실패했을 때만 쓰인다. */
export const DEFAULT_JPY_KRW = 8.62

export interface FxRate {
  jpyToKrw: number
  /** ISO 날짜/시각 */
  asOf: string
}

let current: FxRate = { jpyToKrw: DEFAULT_JPY_KRW, asOf: 'default' }

export function setFxRate(rate: FxRate): void {
  if (!Number.isFinite(rate.jpyToKrw) || rate.jpyToKrw <= 0) return
  current = rate
}

export function getFxRate(): FxRate {
  return current
}

/** 원본 통화 금액 → 원화. KRW 는 그대로 반환한다. */
export function toKrw(amount: number, currency: Currency | undefined, rate: FxRate = current): number {
  if (!Number.isFinite(amount)) return 0
  if (!currency || currency === 'KRW') return Math.round(amount)
  return Math.round(amount * rate.jpyToKrw)
}

/** "¥2,199" / "2,199원" */
export function formatMoney(amount: number, currency: Currency = 'KRW'): string {
  if (currency === 'JPY') return `¥${Math.round(amount).toLocaleString('ja-JP')}`
  if (amount === 0) return '나눔'
  return `${Math.round(amount).toLocaleString('ko-KR')}원`
}

/** 환산가는 지불액이 아니므로 "약" 을 붙이고 100원 단위로 뭉갠다 */
export function formatApproxKrw(krw: number): string {
  const rounded = krw >= 10_000 ? Math.round(krw / 100) * 100 : Math.round(krw / 10) * 10
  return `약 ${rounded.toLocaleString('ko-KR')}원`
}
