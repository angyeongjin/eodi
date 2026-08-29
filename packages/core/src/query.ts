import type { CategoryId, InterpretedQuery } from './types.js'
import type { ProductMatcher } from './catalog.js'
import { normalizeText, tokenize } from './text.js'
import { extractVariant } from './variant.js'

/** "10만" → 100000, "1억" → 100000000, "50000" → 50000 */
function toKrw(num: string, unit?: string): number {
  const n = Number(num)
  if (!Number.isFinite(n)) return 0
  if (unit === '억') return Math.round(n * 100_000_000)
  if (unit === '만') return Math.round(n * 10_000)
  if (unit === '천') return Math.round(n * 1_000)
  return Math.round(n)
}

const UPPER_WORDS = '이하|이내|아래|밑|미만|까지|under'
const LOWER_WORDS = '이상|넘는|넘게|초과|부터|위로|over'

interface PriceCond {
  minPrice?: number
  maxPrice?: number
  /** 질의에서 걷어내야 할 구간들 */
  spans: Array<[number, number]>
}

/**
 * 자연어 가격 조건을 뽑는다.
 *  "10만원 이하", "5만~10만", "30만원 이상", "100000원 밑으로"
 */
export function extractPriceCondition(normalized: string): PriceCond {
  const out: PriceCond = { spans: [] }

  // 구간: 5만~10만 / 50000-100000
  const range = normalized.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(억|만|천)?\s*원?\s*(?:~|부터|에서)\s*(\d+(?:\.\d+)?)\s*(억|만|천)?\s*원?`),
  )
  if (range && range.index !== undefined) {
    const lo = toKrw(range[1]!, range[2] ?? range[4])
    const hi = toKrw(range[3]!, range[4] ?? range[2])
    if (lo > 0 && hi > 0) {
      out.minPrice = Math.min(lo, hi)
      out.maxPrice = Math.max(lo, hi)
      out.spans.push([range.index, range.index + range[0].length])
      return out
    }
  }

  const upper = normalized.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(억|만|천)?\s*원?\s*(?:${UPPER_WORDS})`),
  )
  if (upper && upper.index !== undefined) {
    const v = toKrw(upper[1]!, upper[2])
    if (v > 0) {
      out.maxPrice = v
      out.spans.push([upper.index, upper.index + upper[0].length])
    }
  }

  const lower = normalized.match(
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(억|만|천)?\s*원?\s*(?:${LOWER_WORDS})`),
  )
  if (lower && lower.index !== undefined) {
    const v = toKrw(lower[1]!, lower[2])
    if (v > 0) {
      out.minPrice = v
      out.spans.push([lower.index, lower.index + lower[0].length])
    }
  }

  return out
}

function cutSpans(s: string, spans: Array<[number, number]>): string {
  if (spans.length === 0) return s
  const sorted = [...spans].sort((a, b) => b[0] - a[0])
  let out = s
  for (const [from, to] of sorted) out = out.slice(0, from) + ' ' + out.slice(to)
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * 사용자 질의를 해석한다.
 * 마켓에 그대로 던질 검색어(searchTerm)와 우리가 걸어줄 조건을 분리하는 게 핵심이다.
 */
export function interpretQuery(raw: string, matcher: ProductMatcher): InterpretedQuery {
  const normalized = normalizeText(raw)
  const price = extractPriceCondition(normalized)
  const searchTermRaw = cutSpans(normalized, price.spans)

  const m = matcher.match(searchTermRaw || normalized)
  const product = m ? matcher.get(m.productId) : undefined
  const variant = extractVariant(searchTermRaw || normalized, product)

  const result: InterpretedQuery = {
    raw,
    normalized,
    tokens: tokenize(searchTermRaw || normalized),
    productId: m?.productId ?? null,
    searchTerm: searchTermRaw || normalized,
  }
  if (product) {
    result.productName = product.name
    result.category = product.category as CategoryId
  }
  if (price.minPrice !== undefined) result.minPrice = price.minPrice
  if (price.maxPrice !== undefined) result.maxPrice = price.maxPrice
  if (variant.storageGb !== undefined) result.storageGb = variant.storageGb
  return result
}
