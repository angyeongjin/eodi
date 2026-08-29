import { NextResponse } from 'next/server'
import { normalizeText, toKrw, type MarketScope, type RawListing } from '@eodi/core'
import { searchStoredListings } from '@eodi/db'
import { clientKey, consume } from '@/lib/ratelimit'
import { interleaveByTerm } from '@/lib/feed'

/**
 * 홈 피드 — 브라우저가 "이 키워드들의 최근 매물"을 물어보는 곳.
 *
 * 개인화의 재료(찜·최근 검색어)는 전부 그 사람 브라우저에 있고, 우리는 프로필을 만들지 않는다.
 * 서버가 아는 것은 "이번 요청이 이 키워드를 물었다"뿐이고 그걸 저장하지도 않는다.
 *
 * 두 가지를 일부러 하지 않는다.
 * 1. **실시간 연합검색을 쓰지 않는다.** 우리 인덱스만 읽는다 — 사용자가 요청하지 않은 조회로
 *    남의 서버를 두들기지 않기 위해서다. 피드는 사용자가 검색을 친 것이 아니다.
 * 2. **검색 로그를 남기지 않는다.** 브라우저가 알아서 보낸 요청이 검색으로 세지면
 *    클릭률 분모가 부풀고, 우리는 그 숫자로 랭킹과 제휴를 판단하게 된다.
 */
export const dynamic = 'force-dynamic'

const MAX_TERMS = 5
const MAX_TERM_LEN = 40
const PER_TERM = 6
const TOTAL = 12
/** 홈에 낡은 매물을 깔면 첫인상이 그대로 망가진다. 검색보다 짧게 잡는다 */
const FRESH_DAYS = 5

export async function GET(req: Request): Promise<Response> {
  const { allowed, retryAfterSec } = consume(`feed:${clientKey(req)}`, 0.5)
  if (!allowed) {
    return NextResponse.json(
      { items: [], error: '잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  const url = new URL(req.url)
  const scope: MarketScope = url.searchParams.get('scope') === 'overseas' ? 'overseas' : 'domestic'
  const terms = [
    ...new Set(
      (url.searchParams.get('terms') ?? '')
        .split(',')
        .map((t) => normalizeText(t).slice(0, MAX_TERM_LEN))
        .filter(Boolean),
    ),
  ].slice(0, MAX_TERMS)

  if (terms.length === 0) return NextResponse.json({ items: [], terms: [] })

  const found = await Promise.all(
    terms.map((term) =>
      searchStoredListings(term, { limit: PER_TERM, freshDays: FRESH_DAYS, scope })
        .then((listings) => listings.map((l) => ({ term, listing: l })))
        .catch(() => []),
    ),
  )

  // 키워드마다 한 건씩 번갈아 담는다 (lib/feed.ts)
  const items = interleaveByTerm<{ term: string; listing: RawListing }>(
    found,
    TOTAL,
    (row) => `${row.listing.source}:${row.listing.sourceItemId}`,
  )

  /*
    RawListing 에는 priceKrw 가 없다 — 원화 환산은 병합 단계에서 붙는다.
    피드는 그 단계를 거치지 않으므로 여기서 만들어 준다. 없는 필드를 화면이 읽으면 NaN 이 뜬다.
  */
  const withKrw = items.map(({ term, listing }) => ({
    term,
    listing: { ...listing, priceKrw: toKrw(listing.price, listing.currency) },
  }))

  return NextResponse.json(
    { terms, items: withKrw },
    // 같은 키워드 조합은 잠깐 재사용한다. 인덱스는 예열 크론이 채우므로 초 단위로 바뀌지 않는다.
    { headers: { 'Cache-Control': 'private, max-age=120' } },
  )
}
