import { envNum } from '@eodi/core'

/**
 * 아주 단순한 토큰 버킷.
 *
 * 인스턴스마다 따로 세므로 완벽한 방어는 아니다. 목적은 "우리가 남의 서버를 대신 두들기는 것"을
 * 막는 것이고, 같은 검색어는 캐시가 이미 흡수하므로 이 정도면 실효가 있다.
 */
interface Bucket {
  tokens: number
  updatedAt: number
}

const buckets = new Map<string, Bucket>()
const CAPACITY = envNum('RATE_LIMIT_BURST', 20)
const REFILL_PER_SEC = envNum('RATE_LIMIT_PER_SEC', 0.5)
const MAX_KEYS = 5_000

export interface RateResult {
  allowed: boolean
  retryAfterSec: number
}

export function consume(key: string, cost = 1): RateResult {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b) {
    if (buckets.size >= MAX_KEYS) buckets.clear()
    b = { tokens: CAPACITY, updatedAt: now }
    buckets.set(key, b)
  }
  const elapsed = (now - b.updatedAt) / 1000
  b.tokens = Math.min(CAPACITY, b.tokens + elapsed * REFILL_PER_SEC)
  b.updatedAt = now

  if (b.tokens < cost) {
    return { allowed: false, retryAfterSec: Math.ceil((cost - b.tokens) / REFILL_PER_SEC) }
  }
  b.tokens -= cost
  return { allowed: true, retryAfterSec: 0 }
}

/** 프록시 뒤에서의 클라이언트 식별 */
export function clientKey(req: Request): string {
  const h = req.headers
  const ip =
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('cf-connecting-ip') ??
    'unknown'
  return ip
}
