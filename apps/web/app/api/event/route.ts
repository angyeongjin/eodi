import { NextResponse } from 'next/server'
import { parseEvent } from '@eodi/core'
import { recordEvent } from '@eodi/db'
import { clientKey, consume } from '@/lib/ratelimit'

/**
 * 계측 수집구.
 *
 * `navigator.sendBeacon` 이 보내는 요청이라 응답을 아무도 읽지 않는다. 그래서 본문 없이 204 를 준다.
 * 잘못된 값이 와도 400 을 돌려주지 않는다 — 브라우저는 어차피 못 고치고, 상태 코드로 답하면
 * 계측 실패가 사용자 화면의 콘솔 에러로 번진다. 조용히 버리고 서버 쪽 숫자만 안 늘린다.
 */
export const dynamic = 'force-dynamic'

const MAX_BODY = 1_000

export async function POST(req: Request): Promise<Response> {
  // 계측은 남의 서버를 때리지 않으므로 검색보다 후하게 준다. 다만 무한은 아니다.
  const { allowed } = consume(`event:${clientKey(req)}`, 0.2)
  if (!allowed) return new NextResponse(null, { status: 429 })

  const raw = await req.text().catch(() => '')
  if (!raw || raw.length > MAX_BODY) return new NextResponse(null, { status: 204 })

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  const event = parseEvent(payload)
  if (!event) return new NextResponse(null, { status: 204 })

  await recordEvent(event)
  return new NextResponse(null, { status: 204 })
}
