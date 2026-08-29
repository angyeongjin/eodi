import Link from 'next/link'
import { relatedTerms, type MarketScope } from '@eodi/core'

/*
  연관검색어.

  굿즈는 재고가 유동적이라 0건이 잦다. 그때 빈 화면만 주면 사람은 그냥 나간다.
  같은 작품의 다른 캐릭터를 권하면 적어도 한 번 더 볼 이유가 생긴다.
  작품 이름만 알고 온 사람에게는 최애를 고를 목록이 된다.

  추천은 검색 로그가 아니라 굿즈 사전의 관계에서 뽑는다 —
  "이걸 본 사람은 이것도" 는 트래픽이 쌓여야 의미가 있고, 지금 로그는
  대부분 예열과 개발자 테스트다. 지어낸 추천을 주느니 아는 관계만 보여준다.
*/

function Chip({ term, scope }: { term: string; scope: MarketScope }) {
  const href = `/search?q=${encodeURIComponent(term)}${scope === 'overseas' ? '&scope=overseas' : ''}`
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors hover:opacity-80"
      style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
    >
      {term}
    </Link>
  )
}

export default function RelatedTerms({
  query,
  scope,
  /** 0건 화면에서는 더 적극적으로 — 굿즈 종류까지 붙여 권한다 */
  emphasis = false,
}: {
  query: string
  scope: MarketScope
  emphasis?: boolean
}) {
  const { siblings, work, staples } = relatedTerms(query)
  if (siblings.length === 0 && !work) return null

  const workKo = work?.ko[0]
  // 이미 그 작품을 검색한 사람에게 같은 말을 다시 권하지 않는다
  const showWork = workKo && !query.includes(workKo)

  return (
    <section
      className={emphasis ? 'mt-6 rounded-xl border p-5' : 'mt-4'}
      style={emphasis ? { borderColor: 'var(--border)' } : undefined}
      aria-label="연관 검색어"
    >
      <p className="text-sm font-semibold">
        {emphasis ? '이런 건 어떠세요' : work ? `${work.ko[0]} 관련` : '함께 찾는 말'}
      </p>

      {showWork && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip term={workKo} scope={scope} />
        </div>
      )}

      {siblings.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {siblings.map((t) => (
            <Chip key={t.ja} term={t.ko[0]!} scope={scope} />
          ))}
        </div>
      )}

      {emphasis && workKo && (
        <div className="mt-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            굿즈 종류로 넓혀 보기
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {staples.map((t) => (
              <Chip key={t.ja} term={`${workKo} ${t.ko[0]}`} scope={scope} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
