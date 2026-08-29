'use client'

import { useEffect, useState } from 'react'
import type { MergedListing } from '@eodi/core'
import { isSaved, itemKey, toggleSaved } from '@/lib/saved'

/**
 * 찜 버튼.
 *
 * 서버 왕복이 없다. 누르면 즉시 반응한다.
 * 서버 렌더 결과와 어긋나지 않도록 마운트 전에는 빈 상태로 그린다(하이드레이션 불일치 방지).
 */
export default function SaveButton({ item }: { item: MergedListing }) {
  const key = itemKey(item)
  const [saved, setSaved] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setSaved(isSaved(key))
    setReady(true)
    const onChange = () => setSaved(isSaved(key))
    window.addEventListener('eodi:saved-changed', onChange)
    return () => window.removeEventListener('eodi:saved-changed', onChange)
  }, [key])

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? '찜 해제' : '찜하기'}
      title={saved ? '찜 해제' : '찜하기'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setSaved(toggleSaved(item))
      }}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors"
      style={{
        borderColor: saved ? 'var(--brand)' : 'var(--border)',
        background: saved ? 'var(--brand-weak)' : 'var(--surface)',
        color: saved ? 'var(--brand)' : 'var(--text-muted)',
        opacity: ready ? 1 : 0.5,
      }}
    >
      <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden>
        <path
          d="M10 17.5 3.5 11.2a4.2 4.2 0 0 1 5.9-6l.6.6.6-.6a4.2 4.2 0 0 1 5.9 6L10 17.5Z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
