import Link from 'next/link'
import { CATEGORY_LABEL, CATALOG, GOODS_TERMS, type CategoryId } from '@eodi/core'
import { popularQueries } from '@eodi/db'
import { SEED_KEYWORDS, allAdapters } from '@eodi/crawler'
import SearchBox from '@/components/SearchBox'
import Wordmark from '@/components/Wordmark'
import { Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'

export const revalidate = 3600

const CATEGORY_ORDER: CategoryId[] = [
  'smartphone', 'tablet', 'laptop', 'earbuds', 'watch', 'console', 'camera', 'monitor',
]

/** 첫 화면에 세울 굿즈 검색어 — 작품과 종류를 섞는다 */
const GOODS_HOME = [
  '피규어', '넨도로이드', '아크릴스탠드', '캔뱃지', '이치방쿠지',
  '주술회전', '포켓몬', '하츠네미쿠', '원피스', '산리오',
]

export default async function HomePage() {
  const popular = await popularQueries(12)
  const keywords = popular.length >= 6 ? popular.map((p) => p.term) : SEED_KEYWORDS.slice(0, 14)

  const byCategory = CATEGORY_ORDER.map((c) => ({
    id: c,
    label: CATEGORY_LABEL[c],
    products: CATALOG.filter((p) => p.category === c).slice(0, 6),
  })).filter((g) => g.products.length > 0)

  return (
    <>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-8 pt-16 sm:pt-24">
        <div className="text-center">
          <h1 className="flex justify-center">
            <Wordmark size="lg" />
            <span className="sr-only">{SITE.name}</span>
          </h1>
          <p className="mt-4 text-base" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text)' }}>일본 굿즈</strong>와{' '}
            <strong style={{ color: 'var(--text)' }}>국내 중고</strong>를 한글로 한 번에
          </p>
        </div>

        <div className="mt-7">
          <SearchBox size="lg" autoFocus />
        </div>

        <p className="mt-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          {allAdapters('domestic').filter((a) => a.enabled).map((a) => a.label).join(' · ')}
        </p>

        {/*
          타깃이 굿즈 수집가로 옮겨간 뒤로, 첫 화면의 주인공도 굿즈여야 한다.
          예전에는 당근 사이트맵에서 온 "자전거·픽시·냉장고"가 맨 위에 있었는데
          그건 우리가 이기려는 싸움이 아니다.
        */}
        <section className="mt-8 rounded-xl border p-4" style={{ borderColor: 'var(--brand)', background: 'var(--brand-weak)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>
            일본 굿즈를 한글로 검색하세요
          </h2>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            야후옥션·메루카리는 한글 검색어에 아무 결과도 주지 않습니다.
            <br className="hidden sm:block" />
            굿즈 사전 {GOODS_TERMS.length}항목으로 일본어를 대신 찾고, 가품·개조 표기까지 짚어드립니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {GOODS_HOME.map((k) => (
              <Link
                key={k}
                href={`/jp/${encodeURIComponent(k)}`}
                className="inline-flex h-8 items-center rounded-full border px-3 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                {k}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold">작품으로 찾기</h2>
            <ul className="space-y-1">
              {GOODS_TERMS.filter((t) => t.kind === 'ip').slice(0, 10).map((t) => (
                <li key={t.ja}>
                  <Link href={`/jp/${encodeURIComponent(t.ko[0]!)}`} className="text-sm hover:underline" style={{ color: 'var(--text-muted)' }}>
                    {t.ko[0]} <span className="opacity-60">{t.ja}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">종류로 찾기</h2>
            <ul className="space-y-1">
              {GOODS_TERMS.filter((t) => t.kind === 'category').slice(0, 10).map((t) => (
                <li key={t.ja}>
                  <Link href={`/jp/${encodeURIComponent(t.ko[0]!)}`} className="text-sm hover:underline" style={{ color: 'var(--text-muted)' }}>
                    {t.ko[0]} <span className="opacity-60">{t.ja}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            국내 중고도 함께 찾습니다
          </h2>
          <div className="flex flex-wrap gap-2">
            {keywords.map((k) => (
              <Link
                key={k}
                href={`/search?q=${encodeURIComponent(k)}`}
                className="inline-flex h-8 items-center rounded-full border px-3 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                {k}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 sm:grid-cols-2">
          {byCategory.map((g) => (
            <div key={g.id}>
              <h2 className="mb-2 text-sm font-semibold">{g.label}</h2>
              <ul className="space-y-1">
                {g.products.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/s/${encodeURIComponent(p.name)}`}
                      className="text-sm hover:underline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <h2 className="mb-2 font-semibold">이렇게 씁니다</h2>
          <ul className="space-y-1.5" style={{ color: 'var(--text-muted)' }}>
            <li>· <strong style={{ color: 'var(--text)' }}>“주술회전 아크릴스탠드”</strong> 를 한글로 치면 일본어로 바꿔서 찾습니다</li>
            <li>· <strong style={{ color: 'var(--text)' }}>가품·개조·예약</strong> 표기를 일본어까지 읽어 배지로 알려줍니다</li>
            <li>· 엔화 가격에 원화 환산을 함께 보여줍니다 (구매대행·배송·관세는 별도)</li>
            <li>· <strong style={{ color: 'var(--text)' }}>“아이폰16 프로 100만원 이하”</strong> 처럼 조건을 문장으로 써도 됩니다</li>
            <li>· 여러 마켓에 중복으로 올라온 같은 매물은 한 장으로 묶어 보여줍니다</li>
            <li>· 클릭하면 원래 마켓으로 이동합니다. 거래는 그곳에서 진행됩니다</li>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  )
}
