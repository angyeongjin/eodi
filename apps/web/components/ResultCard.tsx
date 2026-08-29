import type { MergedListing } from '@eodi/core'
import {
  KIND_LABEL, PRICE_FLAG_LABEL, SOURCE_LABEL, WARNING_LABEL, WARNING_DESC,
  formatMoney, formatApproxKrw, estimateLandedCost, formatCostRange, toKrw,
} from '@eodi/core'
import { relativeTime, remainingTime, shortRegion, won } from '@/lib/format'
import SaveButton from './SaveButton'
import Highlight from './Highlight'

function SourceBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
    >
      {children}
    </span>
  )
}

/**
 * 결과 카드.
 * 가격 → 제목 → 출처 순으로 읽히게 짠다. 사람들은 가격부터 본다.
 * 썸네일 자리는 이미지가 없어도 항상 같은 크기를 차지한다(레이아웃 흔들림 방지).
 */
export default function ResultCard({
  item,
  now,
  query = '',
  position,
}: {
  item: MergedListing
  now: number
  /** 제목에서 강조할 검색어 (해외 탭은 번역된 일본어) */
  query?: string
  /** 결과에서 몇 번째인지(0-based). 클릭이 어느 순위에서 나오는지 세는 데만 쓴다 */
  position?: number
}) {
  const others = item.duplicates
  const showKind = item.kind !== 'item'
  /*
    일본 매물의 표시가는 지불액이 아니다. 대행 수수료·국제배송·관세가 붙는데,
    그걸 결제 직전에 알게 되면 우리가 싸 보이게 속인 셈이 된다.
    정확한 값은 낼 수 없으므로 범위로, "추정"이라고 밝히고 보여준다.
  */
  const landed =
    item.currency === 'JPY'
      ? estimateLandedCost({
          priceKrw: item.priceKrw,
          domesticShippingKrw: toKrw(item.shippingFee ?? 0, item.currency),
        })
      : null

  return (
    <article
      className="rounded-xl border transition-colors"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex min-w-0 flex-1 gap-3 sm:gap-4"
        /* 이 두 값이 OutboundTracker 가 읽는 전부다. 개인을 식별하는 값은 없다 */
        data-outbound={item.source}
        data-pos={position}
      >
        <div
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:h-32 sm:w-32"
          style={{ background: 'var(--surface-2)' }}
        >
          {item.thumbnailUrl ? (
            /* 원본 CDN 을 그대로 참조한다. 우리가 이미지를 재호스팅하지 않는다. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
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
          {item.sold && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold text-white">
              판매완료
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <strong className="tnum text-lg font-bold sm:text-xl">
              {item.currency === 'JPY' ? formatMoney(item.price, 'JPY') : won(item.price)}
            </strong>
            {item.currency === 'JPY' && (
              /* 환산가는 참고값이지 지불액이 아니다. 작게 둔다. */
              <span className="tnum text-sm" style={{ color: 'var(--text-muted)' }}>
                {formatApproxKrw(item.priceKrw)}
              </span>
            )}
            {item.priceFlag && item.priceFlag !== 'free' && (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ background: 'var(--warn-weak)', color: 'var(--warn)' }}
              >
                {PRICE_FLAG_LABEL[item.priceFlag]}
              </span>
            )}
          </div>

          {landed && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              예상 총액 <span className="tnum">{formatCostRange(landed.low, landed.high)}</span>
              <span className="ml-1 opacity-80">추정</span>
            </p>
          )}

          <h3 className="line-clamp-2 mt-1 text-sm leading-snug sm:text-[15px]">
            <Highlight text={item.title} query={query} />
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item.sources.map((s) => (
              <SourceBadge key={s}>{SOURCE_LABEL[s]}</SourceBadge>
            ))}
            {showKind && (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ background: 'var(--brand-weak)', color: 'var(--brand-text)' }}
              >
                {KIND_LABEL[item.kind]}
              </span>
            )}
            {item.variant.storageGb && (
              <SourceBadge>
                {item.variant.storageGb >= 1024 ? `${item.variant.storageGb / 1024}TB` : `${item.variant.storageGb}GB`}
              </SourceBadge>
            )}
            {item.variant.sealed && <SourceBadge>미개봉</SourceBadge>}
            {item.listingType === 'auction' && (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ background: 'var(--warn-weak)', color: 'var(--warn)' }}
              >
                경매{item.bidCount ? ` ${item.bidCount}입찰` : ''}
              </span>
            )}
            {/*
              주의 신호는 감추지 않고 보여준다. 개조품을 일부러 찾는 사람도 있다.
              대신 "정품" 같은 긍정 배지는 절대 달지 않는다 — 판매자 주장이지 우리가 검증한 사실이 아니다.
            */}
            {item.warnings.map((wkey) => (
              <span
                key={wkey}
                title={WARNING_DESC[wkey]}
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={{
                  background: wkey === 'replica' ? 'var(--danger-weak)' : 'var(--warn-weak)',
                  color: wkey === 'replica' ? 'var(--danger)' : 'var(--warn)',
                }}
              >
                {WARNING_LABEL[wkey]}
              </span>
            ))}
            {item.shippingFee ? (
              <SourceBadge>
                배송 {formatMoney(item.shippingFee, item.currency ?? 'KRW')}
              </SourceBadge>
            ) : null}
          </div>

          <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            {[
              shortRegion(item.region),
              item.endsAt ? remainingTime(item.endsAt, new Date(now)) : relativeTime(item.postedAt, new Date(now)),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </a>
      <SaveButton item={item} />
      </div>

      {others.length > 0 && (
        <div className="border-t px-3 pb-3 pt-2 sm:px-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            같은 매물이 다른 곳에도 올라와 있습니다
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {others.map((d) => (
              <a
                key={`${d.source}-${d.sourceItemId}`}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: 'var(--border)' }}
                data-outbound={d.source}
                data-pos={position}
              >
                {SOURCE_LABEL[d.source]} ·{' '}
                <span className="tnum">
                  {d.currency === 'JPY' ? formatMoney(d.price, 'JPY') : won(d.price)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

export function ResultCardSkeleton() {
  return (
    <div
      className="flex gap-3 rounded-xl border p-3 sm:gap-4 sm:p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="skeleton h-24 w-24 shrink-0 rounded-lg sm:h-32 sm:w-32" />
      <div className="flex-1 space-y-2 py-1">
        <div className="skeleton h-6 w-28 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-24 rounded" />
      </div>
    </div>
  )
}
