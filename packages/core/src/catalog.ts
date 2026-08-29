import type { CatalogProduct } from './types.js'
import { compact } from './text.js'

export interface MatchResult {
  productId: string
  /** 매칭에 사용된 문자열 총 길이. 구체적일수록 크다 */
  matchedLength: number
  /** 0~1 신뢰도 */
  score: number
}

/**
 * 표준 제품 매처.
 *
 * 핵심 아이디어: 제목을 compact(공백·기호 제거)한 뒤 카탈로그의 매칭어를 substring으로 찾고,
 * **가장 길게 매칭된 제품**을 고른다.
 * "아이폰16프로맥스"는 아이폰16(6) / 아이폰16프로(8) / 아이폰16프로맥스(10) 에 모두 걸리지만
 * 가장 긴 것이 이기므로 형제 모델 간 오탐이 자동으로 해소된다.
 */
export class ProductMatcher {
  private readonly products: CatalogProduct[]
  private readonly byId = new Map<string, CatalogProduct>()
  /** 저비용 사전 필터: 제품별 가장 짧은 첫 그룹 매칭어 */
  private readonly probe: Array<{ p: CatalogProduct; terms: string[] }> = []

  constructor(products: CatalogProduct[]) {
    this.products = products
    for (const p of products) {
      this.byId.set(p.id, p)
      this.probe.push({ p, terms: p.match.require[0] ?? [] })
    }
  }

  get all(): CatalogProduct[] {
    return this.products
  }

  get(id: string): CatalogProduct | undefined {
    return this.byId.get(id)
  }

  getBySlug(slug: string): CatalogProduct | undefined {
    return this.products.find((p) => p.slug === slug)
  }

  /** 제목 하나를 표준 제품에 매칭한다 */
  match(rawTitle: string): MatchResult | null {
    const c = compact(rawTitle)
    if (!c) return null

    let best: { p: CatalogProduct; len: number; groups: number } | null = null
    let runnerUpLen = 0
    let ambiguous = false

    for (const { p, terms } of this.probe) {
      // 1차 필터: 첫 그룹 중 하나라도 없으면 볼 것도 없다
      if (terms.length > 0 && !terms.some((t) => t === '' || c.includes(t))) continue

      // exclude 우선
      if (p.match.exclude?.some((t) => c.includes(t))) continue

      // 모든 require 그룹 충족 확인 + 매칭 길이 합산
      let total = 0
      let ok = true
      for (const group of p.match.require) {
        let bestTerm = -1
        for (const t of group) {
          if (t === '') { bestTerm = Math.max(bestTerm, 0); continue }
          if (c.includes(t)) bestTerm = Math.max(bestTerm, t.length)
        }
        if (bestTerm < 0) { ok = false; break }
        total += bestTerm
      }
      if (!ok) continue

      const groups = p.match.require.length
      if (
        !best ||
        total > best.len ||
        (total === best.len && groups > best.groups)
      ) {
        if (best && total === best.len && groups === best.groups) ambiguous = true
        if (best) runnerUpLen = Math.max(runnerUpLen, best.len)
        best = { p, len: total, groups }
      } else {
        runnerUpLen = Math.max(runnerUpLen, total)
        if (total === best.len && groups === best.groups) ambiguous = true
      }
    }

    if (!best) return null

    // 신뢰도: 매칭 길이가 길수록, 경쟁 후보와 차이가 클수록 높다
    let score = Math.min(1, Math.max(0.35, best.len / 9))
    if (ambiguous) score *= 0.6
    else if (runnerUpLen === best.len) score *= 0.75

    return { productId: best.p.id, matchedLength: best.len, score: Number(score.toFixed(3)) }
  }

  /**
   * 사용자 검색어 → 제품 후보.
   * 정확 매칭이 있으면 그걸 최우선으로, 없으면 이름/별칭 부분일치로 채운다.
   */
  suggest(query: string, limit = 8): CatalogProduct[] {
    const q = compact(query)
    if (!q) return []
    const exact = this.match(query)
    const out: CatalogProduct[] = []
    const push = (p: CatalogProduct | undefined) => {
      if (p && !out.some((x) => x.id === p.id)) out.push(p)
    }
    if (exact) push(this.byId.get(exact.productId))

    const scored = this.products
      .map((p) => {
        const hay = compact(`${p.name} ${p.nameEn ?? ''} ${p.brand} ${(p.aliases ?? []).join(' ')}`)
        if (hay.includes(q)) return { p, s: 2 + q.length / hay.length }
        if (q.length >= 2 && hay.includes(q.slice(0, Math.max(2, q.length - 1)))) return { p, s: 1 }
        return null
      })
      .filter((x): x is { p: CatalogProduct; s: number } => x !== null)
      .sort((a, b) => b.s - a.s)

    for (const { p } of scored) {
      if (out.length >= limit) break
      push(p)
    }
    return out.slice(0, limit)
  }
}
