import type { Metadata } from 'next'
import Link from 'next/link'
import { search } from '@eodi/crawler'
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

  const res = await search(query)
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
            <FilterBar params={sp} facets={res.facets} res={res} />
            <div className="mt-3">
              <SourceStatusBar res={res} />
            </div>
          </>
        )}

        {translationFailed ? (
          <TranslationMiss res={res} />
        ) : res.items.length === 0 ? (
          <div className="mt-10 rounded-xl border p-8 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="font-semibold">이 조건으로는 찾지 못했습니다</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {hasFilters ? '필터를 풀면 더 많은 매물이 나올 수 있습니다.' : '검색어를 조금 넓혀보세요.'}
            </p>
            {hasFilters && (
              <Link
                href={buildHref({ q: sp.q, in: sp.in }, {})}
                className="mt-4 inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white"
                style={{ background: 'var(--brand)' }}
              >
                필터 모두 지우기
              </Link>
            )}
            {/* 굿즈는 재고가 유동적이라 0건이 잦다. 빈 화면으로 돌려보내지 않는다. */}
            <div className="mx-auto max-w-md text-left">
              <RelatedTerms query={res.query} scope={scope} emphasis />
            </div>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {res.items.map((item, idx) => (
              <li key={`${item.source}-${item.sourceItemId}`}>
                <ResultCard item={item} now={now} query={highlightQuery} />
                {idx === 5 && (
                  <div className="mt-3">
                    <AdSlot />
                  </div>
                )}
              </li>
            ))}
          </ul>
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
