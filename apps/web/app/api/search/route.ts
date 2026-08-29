import { NextResponse } from 'next/server'
import { searchForRequest } from '@/lib/search'
import { parseSearchParams } from '@/lib/params'
import { clientKey, consume } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * 검색 API.
 * 웹 화면과 완전히 같은 파이프라인을 쓴다 — 화면과 API 가 다른 답을 주면 안 된다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const params: Record<string, string> = {}
  for (const [k, v] of url.searchParams) params[k] = v

  const query = parseSearchParams(params)
  if (!query.q.trim()) {
    return NextResponse.json({ error: '검색어(q)를 함께 보내주세요.' }, { status: 400 })
  }

  // 캐시 미스는 외부 마켓 호출로 이어진다. 우리가 남의 서버를 대신 두들기지 않도록 막는다.
  const rate = consume(clientKey(req))
  if (!rate.allowed) {
    return NextResponse.json(
      { error: '잠시만 기다려 주세요. 짧은 시간에 요청이 많이 몰렸습니다.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  try {
    const res = await searchForRequest(query)
    return NextResponse.json(res, {
      headers: {
        // 같은 검색어는 엣지에서 잠깐 재사용한다
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    console.error('[api/search]', err)
    return NextResponse.json(
      { error: '지금은 마켓을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 502 },
    )
  }
}
