'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SOURCE_LABEL, formatMoney, formatApproxKrw, type SourceId } from '@eodi/core'
import { listSaved, removeSaved, clearSaved, type SavedItem } from '@/lib/saved'
import { relativeTime, shortRegion } from '@/lib/format'

export default function SavedList() {
  const [items, setItems] = useState<SavedItem[] | null>(null)

  useEffect(() => {
    const sync = () => setItems(listSaved())
    sync()
    window.addEventListener('eodi:saved-changed', sync)
    return () => window.removeEventListener('eodi:saved-changed', sync)
  }, [])

  // 마운트 전에는 아무것도 단정하지 않는다 ("없습니다"가 깜빡이면 버그처럼 보인다)
  if (items === null) {
    return <div className="skeleton mt-5 h-24 rounded-xl" />
  }

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-xl border p-8 text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="font-semibold">아직 찜한 매물이 없습니다</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          검색 결과에서 하트를 누르면 여기 모입니다.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white"
          style={{ background: 'var(--brand)' }}
        >
          검색하러 가기
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mt-4 flex items-center justify-between">
        <span className="tnum text-sm">{items.length}건</span>
        <button
          type="button"
          onClick={() => {
            if (confirm('찜한 매물을 모두 지울까요? 되돌릴 수 없습니다.')) clearSaved()
          }}
          className="text-xs underline"
          style={{ color: 'var(--text-muted)' }}
        >
          전체 삭제
        </button>
      </div>

      <ul className="mt-3 space-y-3">
        {items.map((i) => (
          <li
            key={i.key}
            className="flex gap-3 rounded-xl border p-3"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 flex-1 gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-2)' }}>
                {i.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <strong className="tnum">
                    {i.currency === 'JPY' ? formatMoney(i.price, 'JPY') : formatMoney(i.price, 'KRW')}
                  </strong>
                  {i.currency === 'JPY' && (
                    <span className="tnum text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatApproxKrw(i.priceKrw)}
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 mt-1 text-sm">{i.title}</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {[SOURCE_LABEL[i.source as SourceId] ?? i.source, shortRegion(i.region), `${relativeTime(new Date(i.savedAt))} 찜`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </a>
            <button
              type="button"
              onClick={() => removeSaved(i.key)}
              aria-label="찜 해제"
              className="h-8 w-8 shrink-0 rounded-lg border text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        원본 마켓에서 이미 판매됐거나 삭제된 매물일 수 있습니다. 찜 목록은 그때의 정보를 그대로 보관합니다.
      </p>
    </>
  )
}
