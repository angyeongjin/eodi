/** DATABASE_URL 이 없을 때 쓰는 인메모리 대체 저장소. 프로세스 수명만큼만 산다. */

interface Entry<T> {
  value: T
  expiresAt: number
}

export class MemoryTtlMap<T> {
  private map = new Map<string, Entry<T>>()
  constructor(private readonly maxSize = 500) {}

  get(key: string): T | null {
    const e = this.map.get(key)
    if (!e) return null
    if (e.expiresAt < Date.now()) {
      this.map.delete(key)
      return null
    }
    // LRU: 최근 사용을 뒤로 보낸다
    this.map.delete(key)
    this.map.set(key, e)
    return e.value
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  get size(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }
}

/** 인기 검색어 카운터 (메모리 폴백) */
export class MemoryCounter {
  private counts = new Map<string, { term: string; n: number; last: number }>()

  add(normalized: string, term: string): void {
    const cur = this.counts.get(normalized)
    if (cur) {
      cur.n++
      cur.last = Date.now()
    } else {
      if (this.counts.size > 2000) this.counts.clear()
      this.counts.set(normalized, { term, n: 1, last: Date.now() })
    }
  }

  top(limit: number): Array<{ term: string; count: number }> {
    return [...this.counts.values()]
      .sort((a, b) => b.n - a.n || b.last - a.last)
      .slice(0, limit)
      .map((x) => ({ term: x.term, count: x.n }))
  }
}

/**
 * 번역 못 한 말을 DB 없이도 쌓아 둔다.
 * 사전을 무엇으로 채울지 알려주는 유일한 신호라, DATABASE_URL 이 없는 로컬에서도
 * 보이는 편이 낫다. 프로세스 수명만큼만 산다.
 */
export class MemoryTermCounter {
  private counts = new Map<string, { hits: number; last: number }>()

  add(term: string): void {
    const cur = this.counts.get(term)
    if (cur) { cur.hits++; cur.last = Date.now(); return }
    if (this.counts.size > 2000) this.counts.clear()
    this.counts.set(term, { hits: 1, last: Date.now() })
  }

  top(limit: number): Array<{ term: string; hits: number; lastSeen: Date }> {
    return [...this.counts.entries()]
      .sort((a, b) => b[1].hits - a[1].hits || b[1].last - a[1].last)
      .slice(0, limit)
      .map(([term, v]) => ({ term, hits: v.hits, lastSeen: new Date(v.last) }))
  }

  clear(): void { this.counts.clear() }
}

/**
 * 계측의 메모리 폴백.
 *
 * DB 없이 `npm run dev` 만으로 서비스가 뜨는 것이 이 저장소의 전제다. 계측만 예외로 두면
 * "로컬에서는 클릭이 안 세진다"는 함정이 생기고, 그건 계측이 깨져 있어도 눈치채지 못한다는 뜻이다.
 * 프로세스 수명만큼만 살지만, 짜는 동안 확인할 수 있다는 점이 중요하다.
 */
export class MemoryMetrics {
  private searches = new Map<string, number>()
  private zero = new Map<string, { term: string; scope: string; count: number; last: number }>()
  private clicksByScope = new Map<string, number>()
  private clicksBySource = new Map<string, number>()
  private clicksByPosition = new Map<number, number>()
  private clickTotal = 0

  addSearch(scope: string, normalized: string, term: string, resultCount: number): void {
    this.searches.set(scope, (this.searches.get(scope) ?? 0) + 1)
    if (resultCount > 0 || !normalized) return

    const key = `${scope} ${normalized}`
    const cur = this.zero.get(key)
    if (cur) {
      cur.count++
      cur.last = Date.now()
      return
    }
    if (this.zero.size > 2000) this.zero.clear()
    this.zero.set(key, { term, scope, count: 1, last: Date.now() })
  }

  addClick(scope: string, source: string | null, position: number | null): void {
    this.clickTotal++
    this.clicksByScope.set(scope, (this.clicksByScope.get(scope) ?? 0) + 1)
    if (source) this.clicksBySource.set(source, (this.clicksBySource.get(source) ?? 0) + 1)
    if (position !== null) {
      this.clicksByPosition.set(position, (this.clicksByPosition.get(position) ?? 0) + 1)
    }
  }

  searchCount(scope?: string): number {
    if (scope) return this.searches.get(scope) ?? 0
    let n = 0
    for (const v of this.searches.values()) n += v
    return n
  }

  clickCount(scope?: string): number {
    if (scope) return this.clicksByScope.get(scope) ?? 0
    return this.clickTotal
  }

  clicksBySourceTop(): Array<{ source: string; clicks: number }> {
    return [...this.clicksBySource.entries()]
      .map(([source, clicks]) => ({ source, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
  }

  clicksByPositionTop(limit: number): Array<{ position: number; clicks: number }> {
    return [...this.clicksByPosition.entries()]
      .map(([position, clicks]) => ({ position, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit)
  }

  zeroTop(limit: number): Array<{ term: string; scope: string; count: number; lastSeen: Date }> {
    return [...this.zero.values()]
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, limit)
      .map((z) => ({ term: z.term, scope: z.scope, count: z.count, lastSeen: new Date(z.last) }))
  }

  clear(): void {
    this.searches.clear()
    this.zero.clear()
    this.clicksByScope.clear()
    this.clicksBySource.clear()
    this.clicksByPosition.clear()
    this.clickTotal = 0
  }
}
