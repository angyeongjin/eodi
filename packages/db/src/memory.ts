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
