'use client'

/**
 * 최근 검색어.
 *
 * 굿즈는 같은 검색어를 반복해서 확인한다 — 매물이 계속 바뀌기 때문이다.
 * 서버에 남기지 않는다. 검색 기록은 남에게 보이고 싶지 않은 정보일 수 있다.
 */
const KEY = 'eodi.recent.v1'
const MAX = 8

export function listRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberRecent(term: string): void {
  const t = term.trim()
  if (!t || t.length > 60) return
  try {
    const next = [t, ...listRecent().filter((x) => x !== t)].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 저장소가 막혀도 검색은 되어야 한다 */
  }
}

/** 한 건만 지운다. 남에게 보이고 싶지 않은 검색어 하나 때문에 전체를 지우게 하지 않는다. */
export function forgetRecent(term: string): string[] {
  const next = listRecent().filter((x) => x !== term)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 저장소가 막혀도 화면은 갱신되어야 한다 */
  }
  return next
}

export function clearRecent(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
