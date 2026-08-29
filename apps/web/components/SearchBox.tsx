'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rememberRecent, listRecent, clearRecent, forgetRecent } from '@/lib/recent'

interface Suggestion {
  term: string
  kind: 'goods' | 'product' | 'popular'
  ja?: string
  group?: string
  scope?: 'domestic' | 'overseas'
  productSlug?: string
}

const KIND_TEXT: Record<Suggestion['kind'], string> = {
  goods: '굿즈',
  product: '모델',
  popular: '인기',
}

interface Props {
  defaultValue?: string
  autoFocus?: boolean
  size?: 'lg' | 'md'
  /** 검색 시 유지할 추가 파라미터 */
  keep?: Record<string, string | undefined>
}

export default function SearchBox({ defaultValue = '', autoFocus, size = 'md', keep }: Props) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    setRecent(listRecent())
  }, [])

  // 입력이 멈춘 뒤에만 물어본다 — 타이핑마다 서버를 때리지 않는다
  useEffect(() => {
    const q = value.trim()
    if (!q) {
      setItems([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (!res.ok) return
        const data = (await res.json()) as { items: Suggestion[] }
        setItems(data.items ?? [])
        setActive(-1)
      } catch {
        /* 자동완성 실패는 조용히 무시한다. 검색 자체를 막으면 안 된다 */
      }
    }, 180)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [value])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function go(term: string, scope?: Suggestion['scope']) {
    const q = term.trim()
    if (!q) return
    const sp = new URLSearchParams({ q })
    for (const [k, v] of Object.entries(keep ?? {})) if (v) sp.set(k, v)
    // 굿즈 사전 제안을 고르면 곧바로 일본 탭으로 보낸다. 국내에서 찾을 물건이 아니다.
    if (scope === 'overseas') sp.set('scope', 'overseas')
    setOpen(false)
    rememberRecent(q)
    router.push(`/search?${sp.toString()}`)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (e.key === 'Enter') go(value)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0) go(items[active]!.term, items[active]!.scope)
      else go(value)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const big = size === 'lg'

  return (
    <div ref={boxRef} className="relative w-full">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-[var(--surface)] ${
          big ? 'h-14 px-4' : 'h-11 px-3'
        }`}
        style={{ borderColor: 'var(--border)' }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="shrink-0" style={{ color: 'var(--text-muted)' }}>
          <path
            fill="currentColor"
            d="M8.5 3a5.5 5.5 0 1 1-3.9 9.4l-2.8 2.8a1 1 0 0 1-1.4-1.4l2.8-2.8A5.5 5.5 0 0 1 8.5 3Zm0 2a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z"
          />
        </svg>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="중고 상품 검색"
          autoFocus={autoFocus}
          value={value}
          placeholder={big ? '찾는 물건을 입력하세요' : '검색'}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`min-w-0 flex-1 bg-transparent outline-none ${big ? 'text-base' : 'text-sm'}`}
          style={{ color: 'var(--text)' }}
        />
        <button
          type="button"
          onClick={() => go(value)}
          className={`shrink-0 rounded-lg px-3 font-semibold text-white ${big ? 'h-10 text-sm' : 'h-8 text-xs'}`}
          style={{ background: 'var(--brand)' }}
        >
          검색
        </button>
      </div>

      {/* 입력 전에는 최근 검색어를 보여준다. 굿즈는 같은 말을 반복해서 확인하는 일이 잦다. */}
      {open && value.trim() === '' && recent.length > 0 && (
        <div
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between px-4 pb-1 pt-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              최근 검색어
            </span>
            <button
              type="button"
              onClick={() => {
                clearRecent()
                setRecent([])
              }}
              className="text-xs underline"
              style={{ color: 'var(--text-muted)' }}
            >
              지우기
            </button>
          </div>
          <ul>
            {recent.map((r) => (
              /* 한 건만 지울 수 있어야 한다 — 지우려고 전체를 날리게 하면 아무도 안 지운다 */
              <li key={r} className="flex items-center">
                <button
                  type="button"
                  onClick={() => go(r)}
                  className="min-w-0 flex-1 truncate px-4 py-2 text-left text-sm hover:opacity-70"
                >
                  {r}
                </button>
                <button
                  type="button"
                  aria-label={`최근 검색어에서 '${r}' 지우기`}
                  title="지우기"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setRecent(forgetRecent(r))}
                  className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {items.map((s, i) => (
            <li key={`${s.kind}-${s.term}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s.term, s.scope)}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm"
                style={{ background: i === active ? 'var(--surface-2)' : 'transparent' }}
              >
                <span className="min-w-0 truncate">
                  {s.term}
                  {/* 어떤 일본어로 찾게 되는지 미리 보여준다 — 틀렸으면 고르기 전에 알 수 있어야 한다 */}
                  {s.ja && (
                    <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {s.ja}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {s.group ?? KIND_TEXT[s.kind]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
