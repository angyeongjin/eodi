'use client'

import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'eodi.theme'
const ORDER: Theme[] = ['system', 'light', 'dark']
const LABEL: Record<Theme, string> = { system: '시스템 설정', light: '밝게', dark: '어둡게' }

/**
 * 테마 토글.
 *
 * 지금까지는 OS 설정만 따라갔다. 낮에도 어두운 화면을 쓰거나 그 반대인 사용자가
 * 아무것도 할 수 없었다. 세 상태를 순환한다 — 시스템 / 밝게 / 어둡게.
 *
 * 선택값은 <html data-theme> 로 반영되고, 실제 색 전환은 CSS 가 한다.
 * 깜빡임(FOUC)은 layout 의 인라인 스크립트가 페인트 전에 처리한다.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme | null) ?? 'system'
    setTheme(ORDER.includes(saved) ? saved : 'system')
    setReady(true)
  }, [])

  function apply(next: Theme) {
    setTheme(next)
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      /* 저장소가 막혀도 이번 세션에는 적용된다 */
    }
    const root = document.documentElement
    if (next === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', next)
  }

  const icon =
    theme === 'dark' ? (
      <path
        fill="currentColor"
        d="M14.5 11.3A6 6 0 0 1 6.7 3.5a6.5 6.5 0 1 0 7.8 7.8Z"
      />
    ) : theme === 'light' ? (
      <>
        <circle cx="9" cy="9" r="3.4" fill="currentColor" />
        <path
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M9 1.5v1.8M9 14.7v1.8M1.5 9h1.8M14.7 9h1.8M3.7 3.7l1.3 1.3M13 13l1.3 1.3M14.3 3.7 13 5M5 13l-1.3 1.3"
        />
      </>
    ) : (
      <path
        fill="currentColor"
        d="M9 1.5a7.5 7.5 0 1 0 0 15v-15Zm0 1.6v11.8a5.9 5.9 0 0 1 0-11.8Z"
      />
    )

  return (
    <button
      type="button"
      onClick={() => apply(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!)}
      aria-label={`테마: ${LABEL[theme]}. 눌러서 변경`}
      title={`테마: ${LABEL[theme]}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', opacity: ready ? 1 : 0.5 }}
    >
      <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
        {icon}
      </svg>
    </button>
  )
}
