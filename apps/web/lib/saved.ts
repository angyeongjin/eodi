'use client'

import type { MergedListing } from '@eodi/core'

/**
 * 찜한 매물.
 *
 * 서버에 두지 않는다. 계정도 없다.
 * 브라우저 localStorage 면 충분하고, 그러면 우리가 개인정보를 한 줄도 갖지 않는다.
 * 기기 간 동기화는 안 되지만, 그걸 위해 계정을 요구하는 비용이 더 크다.
 */
const KEY = 'eodi.saved.v1'
const MAX = 300

export interface SavedItem {
  key: string
  source: string
  sourceItemId: string
  title: string
  price: number
  currency: 'KRW' | 'JPY'
  priceKrw: number
  url: string
  thumbnailUrl?: string
  region?: string
  savedAt: number
}

export function itemKey(l: { source: string; sourceItemId: string }): string {
  return `${l.source}:${l.sourceItemId}`
}

function read(): SavedItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedItem[]) : []
  } catch {
    // 저장소가 막혔거나(사파리 프라이빗) 값이 깨졌다. 기능이 없을 뿐 앱은 멀쩡해야 한다.
    return []
  }
}

function write(items: SavedItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
    window.dispatchEvent(new Event('eodi:saved-changed'))
  } catch {
    /* 저장 실패는 조용히 넘어간다 */
  }
}

export function listSaved(): SavedItem[] {
  return read().sort((a, b) => b.savedAt - a.savedAt)
}

export function isSaved(key: string): boolean {
  return read().some((i) => i.key === key)
}

export function toggleSaved(l: MergedListing): boolean {
  const key = itemKey(l)
  const items = read()
  const idx = items.findIndex((i) => i.key === key)
  if (idx >= 0) {
    items.splice(idx, 1)
    write(items)
    return false
  }
  const entry: SavedItem = {
    key,
    source: l.source,
    sourceItemId: l.sourceItemId,
    title: l.title,
    price: l.price,
    currency: l.currency ?? 'KRW',
    priceKrw: l.priceKrw,
    url: l.url,
    savedAt: Date.now(),
  }
  if (l.thumbnailUrl) entry.thumbnailUrl = l.thumbnailUrl
  if (l.region) entry.region = l.region
  write([entry, ...items])
  return true
}

export function removeSaved(key: string): void {
  write(read().filter((i) => i.key !== key))
}

export function clearSaved(): void {
  write([])
}

export function savedCount(): number {
  return read().length
}
