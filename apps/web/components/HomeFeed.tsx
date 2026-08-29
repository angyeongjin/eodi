'use client'

import { useEffect, useState } from 'react'
import { SOURCE_LABEL, formatMoney, formatApproxKrw, type SourceId } from '@eodi/core'
import { listRecent } from '@/lib/recent'
import { listSaved } from '@/lib/saved'
import { relativeTime, won } from '@/lib/format'

interface FeedListing {
  source: SourceId
  sourceItemId: string
  title: string
  price: number
  priceKrw: number
  currency?: 'KRW' | 'JPY'
  url: string
  thumbnailUrl?: string
  postedAt?: string
}

interface FeedRow {
  term: string
  listing: FeedListing
}

/**
 * 홈 피드 — 내가 남긴 흔적에서 뽑은 최근 매물.
 *
 * **개인화는 이 브라우저 안에서만 일어난다.** 최근 검색어와 찜은 localStorage 에 있고,
 * 서버에는 "이 키워드들의 최근 매물을 달라"고만 묻는다. 우리 서버에 프로필은 생기지 않고,
 * 다른 기기에서 열면 아무것도 이어지지 않는다 — 계정을 만들지 않기로 한 대가이자 이득이다.
 *
 * 흔적이 없는 첫 방문자에게는 인기 검색어로 채운다. 빈 화면보다는 낫고,
 * 그게 개인화가 아니라는 사실은 제목에 그대로 쓴다.
 */
export default function HomeFeed({ fallbackTerms }: { fallbackTerms: string[] }) {
  const [rows, setRows] = useState<FeedRow[] | null>(null)
  const [personal, setPersonal] = useState(false)

  useEffect(() => {
    // 최근 검색어를 앞에, 찜한 매물의 제목 앞부분을 뒤에 둔다. 검색은 의도가 더 분명하다.
    const recent = listRecent().slice(0, 3)
    const saved = listSaved()
      .slice(0, 2)
      .map((s) => s.title.split(/[\s/|[\]]/).filter(Boolean).slice(0, 2).join(' '))
    const mine = [...new Set([...recent, ...saved])].filter(Boolean)

    const terms = mine.length > 0 ? mine : fallbackTerms.slice(0, 3)
    setPersonal(mine.length > 0)
    if (terms.length === 0) {
      setRows([])
      return
    }

    let alive = true
    fetch(`/api/feed?terms=${encodeURIComponent(terms.join(','))}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: FeedRow[] }) => {
        if (alive) setRows(data.items ?? [])
      })
      .catch(() => {
        // 피드가 실패해도 홈은 검색창으로 멀쩡히 동작한다. 조용히 접는다.
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [fallbackTerms])

  // 아직 안 왔거나 보여줄 게 없으면 자리를 차지하지 않는다
  if (rows === null || rows.length === 0) return null

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          {personal ? '내가 찾던 것들의 새 매물' : '요즘 많이 찾는 것들'}
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {personal ? '이 기기에 저장된 검색어·찜에서' : '수집해 둔 매물에서'}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map(({ term, listing }) => (
          <li key={`${listing.source}:${listing.sourceItemId}`}>
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block rounded-xl border p-2 transition-colors"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              /* 검색 결과와 같은 방식으로 아웃바운드 클릭을 센다 */
              data-outbound={listing.source}
              data-term={term}
            >
              <div
                className="relative mb-2 aspect-square w-full overflow-hidden rounded-lg"
                style={{ background: 'var(--surface-2)' }}
              >
                {listing.thumbnailUrl ? (
                  /* 원본 CDN 을 그대로 참조한다. 우리가 이미지를 재호스팅하지 않는다. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-full w-full items-center justify-center text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    이미지 없음
                  </span>
                )}
              </div>

              <strong className="tnum block text-sm font-bold">
                {listing.currency === 'JPY' ? formatMoney(listing.price, 'JPY') : won(listing.price)}
              </strong>
              {listing.currency === 'JPY' && (
                <span className="tnum text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {formatApproxKrw(listing.priceKrw)}
                </span>
              )}
              <p className="line-clamp-2 mt-0.5 text-xs leading-snug">{listing.title}</p>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {SOURCE_LABEL[listing.source]}
                {listing.postedAt ? ` · ${relativeTime(new Date(listing.postedAt), new Date())}` : ''}
              </p>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        최근 수집해 둔 매물이라 이미 팔렸을 수 있습니다. 최신 상태는 원본에서 확인하세요.
      </p>
    </section>
  )
}
