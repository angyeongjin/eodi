import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { search } from '@eodi/crawler'
import { findGoodsWork, goodsWorks, escapeJsonForHtml, formatMoney, GOODS_TERMS } from '@eodi/core'
import SearchBox from '@/components/SearchBox'
import ResultCard from '@/components/ResultCard'
import { Header, Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'

/**
 * 작품별 굿즈 지면.
 *
 * 지금 이 서비스는 검색창에 뭘 칠지 아는 사람만 쓸 수 있다.
 * 작품 이름만 알고 온 사람에게는 최애를 고를 목록이 필요하고,
 * 굿즈를 처음 사는 사람에게는 어떤 종류가 있는지가 먼저다.
 *
 * 검색 결과 한 벌을 옮긴 지면이 아니다. 사전이 아는 관계(작품 → 캐릭터 → 종류)를
 * 펼쳐 놓고 실제 매물은 맛보기로만 붙인다. 얇은 페이지를 양산하지 않으려고
 * 캐릭터가 없는 작품은 만들지 않는다.
 */
export const revalidate = 3600
export const maxDuration = 30
export const dynamicParams = true

/** 굿즈 검색에 실제로 많이 붙는 종류. 전부 사전에 있는 말이어야 한다 */
const FORMS = ['피규어', '아크릴스탠드', '이치방쿠지', '넨도로이드', '캔뱃지', '인형']

export function generateStaticParams(): Array<{ work: string }> {
  // 빌드 때 다 만들면 외부 마켓을 수십 번 두들긴다. 요청이 오면 만들고 한 시간 재사용한다.
  return []
}

type Props = { params: Promise<{ work: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { work: raw } = await params
  const work = findGoodsWork(decodeURIComponent(raw))
  if (!work) return { title: '찾을 수 없는 작품' }
  return {
    title: `${work.ko} 굿즈 — 한글로 찾는 일본 중고 굿즈`,
    description:
      `${work.ko} 굿즈를 한글로 검색합니다. 캐릭터 ${work.characters.length}명과 ` +
      `피규어·아크릴스탠드·이치방쿠지를 야후옥션·메루카리와 국내 마켓에서 한 번에 봅니다.`,
    alternates: { canonical: `/w/${encodeURIComponent(work.ko)}` },
    openGraph: { title: `${work.ko} 굿즈 통합검색 | ${SITE.name}` },
  }
}

function Chip({ term, scope }: { term: string; scope: 'domestic' | 'overseas' }) {
  const href = scope === 'overseas' ? `/jp/${encodeURIComponent(term)}` : `/s/${encodeURIComponent(term)}`
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-full border px-4 text-sm transition-opacity hover:opacity-70"
      style={{ borderColor: 'var(--border)' }}
    >
      {term}
    </Link>
  )
}

export default async function WorkPage({ params }: Props) {
  const { work: raw } = await params
  const work = findGoodsWork(decodeURIComponent(raw))
  if (!work) notFound()

  // 지면의 값은 매물이 아니라 관계에 있다. 매물은 "정말 있구나"를 보여주는 정도만 가져온다.
  const res = await search({ q: work.ko, perPage: 8, scope: 'overseas' }).catch(() => null)
  const items = res?.items ?? []
  const now = Date.now()

  const prices = items.map((i) => i.priceKrw).filter((p): p is number => typeof p === 'number' && p > 0)
  const low = prices.length ? Math.min(...prices) : null
  const high = prices.length ? Math.max(...prices) : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${work.ko} 굿즈`,
    description: `${work.ko} 관련 중고 굿즈를 국내외 마켓에서 한 번에 검색합니다.`,
    url: `${SITE.url.replace(/\/$/, '')}/w/${encodeURIComponent(work.ko)}`,
    about: { '@type': 'CreativeWork', name: work.ko, alternateName: work.ja },
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <SearchBox defaultValue={work.ko} keep={{ scope: 'overseas' }} />

        <header className="mt-6">
          <h1 className="text-2xl font-bold">{work.ko} 굿즈</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            일본에서는 <span className="font-medium">{work.ja}</span> 로 팝니다. 한글로 검색하면
            대신 옮겨 야후옥션·메루카리와 국내 마켓을 함께 찾아 드립니다.
            {low !== null && high !== null && (
              <> 지금 보이는 매물은 {formatMoney(low, 'KRW')}~{formatMoney(high, 'KRW')} 선입니다.</>
            )}
          </p>
        </header>

        <section className="mt-7" aria-labelledby="chars">
          <h2 id="chars" className="text-base font-semibold">캐릭터로 찾기</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            굿즈는 작품보다 최애로 삽니다. 이름을 누르면 그 캐릭터 매물만 봅니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {work.characters.map((c) => (
              <Chip key={c.ja} term={c.ko[0]!} scope="overseas" />
            ))}
          </div>
        </section>

        <section className="mt-7" aria-labelledby="forms">
          <h2 id="forms" className="text-base font-semibold">종류로 찾기</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {FORMS.map((f) => (
              <Chip key={f} term={`${work.ko} ${f}`} scope="overseas" />
            ))}
          </div>
        </section>

        {items.length > 0 && (
          <section className="mt-8" aria-labelledby="items">
            <div className="flex items-baseline justify-between">
              <h2 id="items" className="text-base font-semibold">지금 나와 있는 매물</h2>
              <Link
                href={`/search?q=${encodeURIComponent(work.ko)}&scope=overseas`}
                className="text-sm underline"
                style={{ color: 'var(--text-muted)' }}
              >
                전부 보기
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {items.map((item) => (
                <li key={`${item.source}-${item.sourceItemId}`}>
                  <ResultCard item={item} now={now} query={work.ja} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="mt-10 border-t pt-6" style={{ borderColor: 'var(--border)' }} aria-label="다른 작품">
          <h2 className="text-base font-semibold">다른 작품</h2>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
            {goodsWorks()
              .filter((w) => w.ko !== work.ko)
              .slice(0, 24)
              .map((w) => (
                <Link
                  key={w.ko}
                  href={`/w/${encodeURIComponent(w.ko)}`}
                  className="text-sm underline decoration-dotted"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {w.ko}
                </Link>
              ))}
          </div>
        </nav>
      </main>
      <Footer />
      {/* JSON-LD. 값은 escapeJsonForHtml 로 </script> 와 태그 문자를 막는다 — /jp/, /s/ 와 같은 방식 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonForHtml(JSON.stringify(jsonLd)) }}
      />
    </>
  )
}

// 사전에 없는 종류를 적어두고 링크만 걸면 죽은 지면이 된다
{
  const known = new Set(GOODS_TERMS.flatMap((t) => t.ko))
  const missing = FORMS.filter((f) => !known.has(f))
  if (missing.length) throw new Error(`사전에 없는 굿즈 종류: ${missing.join(', ')}`)
}
