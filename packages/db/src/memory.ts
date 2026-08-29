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
