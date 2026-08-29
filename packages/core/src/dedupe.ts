import type { EnrichedListing, MergedListing, SourceId } from './types.js'
import { compact } from './text.js'

/** 문자 3-gram 집합 */
export function trigrams(s: string): Set<string> {
  const c = compact(s)
  const out = new Set<string>()
  if (c.length <= 3) {
    if (c) out.add(c)
    return out
  }
  for (let i = 0; i + 3 <= c.length; i++) out.add(c.slice(i, i + 3))
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const x of small) if (large.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/** 교차 마켓 병합 임계값 — 잘못 합치는 것이 놓치는 것보다 나쁘므로 보수적으로 잡는다 */
export const CROSS_SOURCE_SIMILARITY = 0.62
export const SAME_SOURCE_SIMILARITY = 0.9
const PRICE_TOLERANCE = 0.02
const POSTED_TOLERANCE_MS = 3 * 86_400_000

/** 통화가 다를 수 있으므로 원화 환산가로 비교한다 */
function priceClose(a: number, b: number): boolean {
  if (a === b) return true
  const hi = Math.max(a, b)
  return hi > 0 && Math.abs(a - b) / hi <= PRICE_TOLERANCE
}

function timeClose(a?: Date, b?: Date): boolean {
  if (!a || !b) return true // 한쪽이라도 모르면 시각으로는 부정하지 않는다
  return Math.abs(a.getTime() - b.getTime()) <= POSTED_TOLERANCE_MS
}

export interface DuplicatePair {
  similarity: number
  reason: string
}

/** 두 매물이 같은 물건인가 */
export function isDuplicate(
  a: EnrichedListing,
  b: EnrichedListing,
  gramsA: Set<string>,
  gramsB: Set<string>,
): DuplicatePair | null {
  const sameSource = a.source === b.source
  // 같은 마켓 재등록은 가격까지 똑같아야 인정한다.
  // 판매자가 비슷한 물건을 여러 개 올린 경우를 하나로 합쳐버리면 안 되기 때문이다.
  if (sameSource ? a.priceKrw !== b.priceKrw : !priceClose(a.priceKrw, b.priceKrw)) return null
  if (!timeClose(a.postedAt, b.postedAt)) return null

  const sim = jaccard(gramsA, gramsB)
  const threshold = sameSource ? SAME_SOURCE_SIMILARITY : CROSS_SOURCE_SIMILARITY
  if (sim < threshold) return null

  // 다른 제품으로 매칭됐다면 제목이 비슷해도 다른 물건이다
  if (a.productId && b.productId && a.productId !== b.productId) return null
  // 용량이 명시적으로 다르면 다른 물건이다
  const sa = a.variant.storageGb
  const sb = b.variant.storageGb
  if (sa !== undefined && sb !== undefined && sa !== sb) return null

  return {
    similarity: Number(sim.toFixed(3)),
    reason: sameSource ? '같은 마켓 재등록' : '다른 마켓 동일 매물',
  }
}

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]!]!
      x = this.parent[x]!
    }
    return x
  }
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

/** 정보가 더 풍부하고 신선한 쪽을 대표로 */
function completeness(l: EnrichedListing): number {
  let s = 0
  if (l.region) s += 2
  if (l.postedAt) s += 2
  if (l.thumbnailUrl) s += 2
  if (!l.sold) s += 3
  s += Math.min(3, l.title.length / 20)
  return s
}

/**
 * 중복 매물을 묶는다.
 * 가격순으로 정렬한 뒤 ±2% 창 안에서만 비교하므로 실질적으로 선형에 가깝다.
 */
export function mergeDuplicates(listings: readonly EnrichedListing[]): MergedListing[] {
  const arr = [...listings].sort((a, b) => a.priceKrw - b.priceKrw)
  const n = arr.length
  const grams = arr.map((l) => trigrams(l.title))
  const uf = new UnionFind(n)

  for (let i = 0; i < n; i++) {
    const base = arr[i]!
    for (let j = i + 1; j < n; j++) {
      const other = arr[j]!
      // 가격 오름차순이므로 허용 오차를 벗어나면 이후는 볼 필요가 없다
      if (other.priceKrw > base.priceKrw * (1 + PRICE_TOLERANCE) && other.priceKrw - base.priceKrw > 1) break
      if (isDuplicate(base, other, grams[i]!, grams[j]!)) uf.union(i, j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = uf.find(i)
    const g = groups.get(r)
    if (g) g.push(i)
    else groups.set(r, [i])
  }

  const out: MergedListing[] = []
  for (const idxs of groups.values()) {
    const members = idxs.map((i) => arr[i]!)
    members.sort((a, b) => completeness(b) - completeness(a))
    const [head, ...rest] = members as [EnrichedListing, ...EnrichedListing[]]
    const sources = Array.from(new Set(members.map((m) => m.source))) as SourceId[]
    out.push({ ...head, sources, duplicates: rest, score: 0 })
  }
  return out
}
