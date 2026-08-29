import type { Metadata } from 'next'
import Link from 'next/link'
import { searchForRequest } from '@/lib/search'
import SearchBox from '@/components/SearchBox'
import ResultCard from '@/components/ResultCard'
import FilterBar from '@/components/FilterBar'
import SourceStatusBar from '@/components/SourceStatusBar'
import RegionPicker from '@/components/RegionPicker'
import ScopeTabs from '@/components/ScopeTabs'
import AlertButton from '@/components/AlertButton'
import OverseasNotice, { TranslationBar, TranslationMiss } from '@/components/OverseasNotice'
import Pagination from '@/components/Pagination'
import RelatedTerms from '@/components/RelatedTerms'
import DidYouMean from '@/components/DidYouMean'
import OutboundTracker from '@/components/OutboundTracker'
import AdSlot from '@/components/AdSlot'
import { Header, Footer } from '@/components/Layout'
import { parseSearchParams, buildHref, scopeOf } from '@/lib/params'
import { won } from '@/lib/format'
import { SITE } from '@/lib/config'

export const dynamic = 'force-dynamic'
// 연합검색은 외부 마켓을 기다린다. Vercel 기본 10초로는 부족할 수 있다.
export const maxDuration = 30

type SP = Record<string, string | string[] | undefined>

export async function generateMetadata({
  searchParams,
}: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? ''
  if (!q) return { title: '검색' }
  return {
    title: `${q} 중고 검색`,
    description: `${q} — 번개장터·당근마켓 매물을 한 번에 모아 봅니다.`,
    alternates: { canonical: `/s/${encodeURIComponent(q)}` },
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const query = parseSearchParams(sp)

  if (!query.q.trim()) {
    return (
      <>
        <Header />
        <main id="main" className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="mb-6" style={{ color: 'var(--text-muted)' }}>무엇을 찾으세요?</p>
          <SearchBox size="lg" autoFocus />
        </main>
        <Footer />
      </>
    )
  }

  const res = await searchForRequest(query)
  const now = Date.now()
  const i = res.interpreted
  const scope = scopeOf(sp)
  const overseas = scope === 'overseas'
  const translationFailed = overseas && !i.overseasTerm
  // 해외 결과는 일본어 제목이므로 번역된 검색어로 강조해야 걸린다
  const highlightQuery = (overseas ? i.overseasTerm : i.searchTerm) ?? res.query
  const hasFilters = Boolean(sp.src || sp.kind || sp.min || sp.max || sp.region || sp.sold || sp.days)

  return (
    <>
      <Header>
        <SearchBox
          defaultValue={res.query}
          keep={{ in: overseas ? undefined : query.regionSlug, scope: overseas ? 'overseas' : undefined }}
        />
      </Header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-4">
        <div className="mb-3">
          <ScopeTabs params={sp} current={scope} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span>
            <strong className="tnum">{res.total.toLocaleString('ko-KR')}</strong>건
          </span>
          {i.productName && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: 'var(--brand-weak)', color: 'var(--brand-text)' }}
            >
              {i.productName}
            </span>
          )}
          {i.maxPrice !== undefined && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {won(i.maxPrice)} 이하
            </span>
          )}
          {i.minPrice !== undefined && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {won(i.minPrice)} 이상
            </span>
          )}
          {!overseas && (
            <div className="ml-auto">
              <RegionPicker params={sp} current={query.regionSlug} />
            </div>
          )}
        </div>

        {overseas && (
          <div className="mb-3 space-y-2">
            <OverseasNotice res={res} />
            <TranslationBar res={res} />
          </div>
        )}

        {!translationFailed && (
          <>
            <div className="mb-2">
              <AlertButton term={res.query} scope={scope} filters={query.filters ?? {}} />
            </div>
            <DidYouMean query={res.query} scope={scope} resultCount={res.total} />
            <FilterBar params={sp} facets={res.facets} res={res} />
            <div className="mt-3">
              <SourceStatusBar res={res} />
            </div>
          </>
        )}

        {translationFailed ? (
          <TranslationMiss res={res} params={sp} />
        ) : res.items.length === 0 ? (
          /*
            0건은 실패가 아니라 "아직 없음"인 경우가 많다. 중고 매물은 계속 새로 올라오기 때문이다.
            그래서 막다른 길로 두지 않는다 — 오타 되묻기 / 조건 풀기 / 다른 탭 / 연관 검색어 / 알림.
            특히 알림은 0건일 때 가치가 가장 크다. 지금 없는 걸 기다리는 사람이 곧 그 사용자다.
          */
          <div className="mt-10 rounded-xl border p-8 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="font-semibold">이 조건으로는 찾지 못했습니다</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {hasFilters ? '필터를 풀면 더 많은 매물이 나올 수 있습니다.' : '중고 매물은 계속 올라옵니다. 오늘 없어도 내일 있을 수 있습니다.'}
            </p>

            {/* 오타부터 되묻는다. 사전에 없는 게 아니라 잘못 친 것일 수 있다 */}
            <DidYouMean query={res.query} scope={scope} resultCount={0} />

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {hasFilters && (
                <Link
                  href={buildHref({ q: sp.q, in: sp.in, scope: sp.scope }, {})}
                  className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white"
                  style={{ background: 'var(--brand)' }}
                >
                  필터 모두 지우기
                </Link>
              )}
              <Link
                href={buildHref(sp, { scope: overseas ? undefined : 'overseas', src: undefined, region: undefined })}
                className="inline-flex h-9 items-center rounded-lg border px-4 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                {overseas ? '국내 마켓에서 찾아보기' : '일본 굿즈에서 찾아보기'}
              </Link>
            </div>

            {/* 굿즈는 재고가 유동적이라 0건이 잦다. 빈 화면으로 돌려보내지 않는다. */}
            <div className="mx-auto mt-4 max-w-md text-left">
              <RelatedTerms query={res.query} scope={scope} emphasis />
            </div>

            <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              위의 <strong style={{ color: 'var(--text)' }}>알림 받기</strong>를 켜두면 이 조건에 맞는 매물이
              올라올 때 알려드립니다. 앱을 설치하지 않아도 됩니다.
            </p>
          </div>
        ) : (
          <OutboundTracker scope={scope} normalized={i.normalized}>
            <ul className="mt-4 space-y-3">
              {res.items.map((item, idx) => (
                <li key={`${item.source}-${item.sourceItemId}`}>
                  <ResultCard
                    item={item}
                    now={now}
                    query={highlightQuery}
                    position={(res.page - 1) * res.perPage + idx}
                  />
                  {idx === 5 && (
                    <div className="mt-3">
                      <AdSlot />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </OutboundTracker>
        )}

        {res.items.length > 0 && <RelatedTerms query={res.query} scope={scope} />}

        <Pagination params={sp} page={res.page} perPage={res.perPage} total={res.total} />

        <p className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          {overseas
            ? '일본 마켓의 공개 검색 결과입니다. 구매는 각 마켓 또는 구매대행 서비스를 통해 진행됩니다.'
            : '매물 정보는 각 마켓이 공개한 검색 결과에서 가져오며, 거래는 원래 마켓에서 이루어집니다.'}
          <br />
          {SITE.name}는 거래 당사자가 아닙니다.
        </p>
      </main>
      <Footer />
    </>
  )
}
