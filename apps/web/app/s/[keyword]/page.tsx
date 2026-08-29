import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { search } from '@eodi/crawler'
import { SOURCE_LABEL, escapeJsonForHtml } from '@eodi/core'
import SearchBox from '@/components/SearchBox'
import ResultCard from '@/components/ResultCard'
import OutboundTracker from '@/components/OutboundTracker'
import AdSlot from '@/components/AdSlot'
import { Header, Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'

/**
 * 검색어별 정적 랜딩.
 * /search 는 매번 실시간 조회라 검색엔진에 노출하기 부담스럽다.
 * 이 경로는 1시간 캐시로 굳혀 크롤러에게 보여주고, 사람에게는 필터가 달린 /search 로 안내한다.
 */
export const revalidate = 3600
export const dynamicParams = true

export function generateStaticParams(): Array<{ keyword: string }> {
  // 빌드 때 미리 긁지 않는다. 첫 요청에 만들어져 캐시된다.
  return []
}

type Props = { params: Promise<{ keyword: string }> }


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { keyword } = await params
  const q = decodeURIComponent(keyword)
  return {
    title: `${q} 중고 매물 통합검색`,
    description: `${q} 중고 매물을 국내 중고마켓 네 곳에서 한 번에 찾아봅니다. 중복 매물은 묶고 매입글은 걸러 보여줍니다.`,
    alternates: { canonical: `/s/${encodeURIComponent(q)}` },
    openGraph: { title: `${q} 중고 매물 통합검색 | ${SITE.name}` },
  }
}

export default async function KeywordPage({ params }: Props) {
  const { keyword } = await params
  const q = decodeURIComponent(keyword).trim()
  if (!q || q.length > 60) notFound()

  // 이 페이지는 ISR 로 다시 그려진다. 렌더는 사용자의 검색이 아니므로 검색 로그에 넣지 않는다.
  const res = await search({ q, perPage: 20 }, { background: true })
  const now = Date.now()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${q} 중고 매물`,
    numberOfItems: res.items.length,
    itemListElement: res.items.slice(0, 20).map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: item.title,
        offers: {
          '@type': 'Offer',
          price: item.price,
          priceCurrency: 'KRW',
          itemCondition: 'https://schema.org/UsedCondition',
          availability: item.sold ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          url: item.url,
        },
      },
    })),
  }

  return (
    <>
      <Header>
        <SearchBox defaultValue={q} />
      </Header>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: escapeJsonForHtml(jsonLd) }} />

      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-lg font-bold">{q} 중고 매물</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {res.sources.filter((s) => s.ok).map((s) => SOURCE_LABEL[s.source]).join(' · ') || '연결된 마켓 없음'}
          에서 모은 <span className="tnum">{res.total.toLocaleString('ko-KR')}</span>건
        </p>

        <div className="mt-3">
          <Link
            href={`/search?q=${encodeURIComponent(q)}`}
            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white"
            style={{ background: 'var(--brand)' }}
          >
            필터·정렬해서 보기
          </Link>
        </div>

        {res.items.length === 0 ? (
          <p className="mt-8 text-sm" style={{ color: 'var(--text-muted)' }}>
            지금은 매물이 없습니다. 잠시 후 다시 확인해 주세요.
          </p>
        ) : (
          // 랜딩에서 나간 클릭도 센다. 검색을 거치지 않았으므로 surface 를 나눠 둔다
          <OutboundTracker
            scope="domestic"
            normalized={res.interpreted.normalized}
            surface="landing"
          >
            <ul className="mt-5 space-y-3">
            {res.items.map((item, idx) => (
              <li key={`${item.source}-${item.sourceItemId}`}>
                <ResultCard item={item} now={now} query={res.interpreted.searchTerm} />
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
      </main>
      <Footer />
    </>
  )
}
