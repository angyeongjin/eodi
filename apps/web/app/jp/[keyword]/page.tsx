import type { Metadata } from 'next'
import Link from 'next/link'
import { search } from '@eodi/crawler'
import { SOURCE_LABEL, escapeJsonForHtml, formatMoney } from '@eodi/core'
import SearchBox from '@/components/SearchBox'
import ResultCard from '@/components/ResultCard'
import OutboundTracker from '@/components/OutboundTracker'
import OverseasNotice from '@/components/OverseasNotice'
import AdSlot from '@/components/AdSlot'
import { Header, Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'

/**
 * 일본 굿즈 검색어별 정적 랜딩.
 *
 * "주술회전 아크릴스탠드 일본"처럼 찾는 사람에게 닿아야 하는 페이지다.
 * 국내 랜딩(/s/)과 분리한 이유는 통화·구매 방식이 달라 같은 문서로 묶으면
 * 검색 의도가 섞이기 때문이다.
 */
export const revalidate = 3600
// 연합검색은 외부 마켓을 기다린다. Vercel 기본 10초로는 부족할 수 있다.
export const maxDuration = 30
export const dynamicParams = true

export function generateStaticParams(): Array<{ keyword: string }> {
  return []
}

type Props = { params: Promise<{ keyword: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { keyword } = await params
  const q = decodeURIComponent(keyword)
  return {
    title: `${q} 일본 중고 굿즈 검색`,
    description: `${q} 를 야후옥션·메루카리에서 한글로 검색합니다. 엔화 가격과 원화 환산을 함께 보여줍니다.`,
    alternates: { canonical: `/jp/${encodeURIComponent(q)}` },
    openGraph: { title: `${q} 일본 굿즈 통합검색 | ${SITE.name}` },
  }
}

export default async function JpKeywordPage({ params }: Props) {
  const { keyword } = await params
  const q = decodeURIComponent(keyword).trim()
  // 이 페이지는 ISR 로 다시 그려진다. 렌더는 사용자의 검색이 아니므로 검색 로그에 넣지 않는다.
  const res = await search({ q, perPage: 20, scope: 'overseas' }, { background: true })
  const now = Date.now()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${q} 일본 중고 굿즈`,
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
          priceCurrency: item.currency ?? 'JPY',
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
        <SearchBox defaultValue={q} keep={{ scope: 'overseas' }} />
      </Header>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: escapeJsonForHtml(jsonLd) }} />

      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-lg font-bold">{q} — 일본 중고 굿즈</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {res.interpreted.overseasTerm ? (
            <>
              일본어 <strong style={{ color: 'var(--text)' }}>{res.interpreted.overseasTerm}</strong> 으로{' '}
              {res.sources.filter((s) => s.ok).map((s) => SOURCE_LABEL[s.source]).join(' · ') || '연결된 마켓 없음'}
              에서 찾은 <span className="tnum">{res.total.toLocaleString('ko-KR')}</span>건
            </>
          ) : (
            '아직 일본어로 옮기지 못하는 검색어입니다.'
          )}
        </p>

        <div className="mt-3">
          <Link
            href={`/search?q=${encodeURIComponent(q)}&scope=overseas`}
            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white"
            style={{ background: 'var(--brand)' }}
          >
            필터·정렬해서 보기
          </Link>
        </div>

        <div className="mt-4">
          <OverseasNotice res={res} />
        </div>

        {res.items.length === 0 ? (
          <p className="mt-8 text-sm" style={{ color: 'var(--text-muted)' }}>
            지금은 매물이 없습니다. 잠시 후 다시 확인해 주세요.
          </p>
        ) : (
          // 랜딩에서 나간 클릭도 센다. 검색을 거치지 않았으므로 surface 를 나눠 둔다
          <OutboundTracker
            scope="overseas"
            normalized={res.interpreted.normalized}
            surface="landing"
          >
            <ul className="mt-5 space-y-3">
            {res.items.map((item, idx) => (
              <li key={`${item.source}-${item.sourceItemId}`}>
                <ResultCard item={item} now={now} query={res.interpreted.overseasTerm ?? q} />
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

        {res.items.length > 0 && (
          <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
            가장 저렴한 매물 {formatMoney(Math.min(...res.items.map((i) => i.price)), 'JPY')} 부터.
            표시 가격에 구매대행 수수료·국제배송비·관세가 추가됩니다.
          </p>
        )}
      </main>
      <Footer />
    </>
  )
}
