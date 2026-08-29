import { NextResponse } from 'next/server'
import { createAlert, listAlerts, deleteAlert, deleteAllAlerts } from '@eodi/db'
import { isAllowedEndpoint, type MarketScope } from '@eodi/core'
import { clientKey, consume } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

interface Body {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  term?: string
  scope?: string
  filters?: unknown
  id?: number
}

/**
 * 구독 객체 검증.
 * 임의 URL 을 받아두면 나중에 우리 서버가 그 주소로 요청을 보내는 SSRF 통로가 된다.
 * 그래서 알려진 푸시 서비스 호스트만 받는다.
 */
function validSubscription(s: Body['subscription']): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys.auth) return false
  if (s.endpoint.length > 1000) return false
  return isAllowedEndpoint(s.endpoint)
}

export async function POST(req: Request) {
  const rate = consume(clientKey(req), 2)
  if (!rate.allowed) {
    return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: '요청을 이해하지 못했습니다.' }, { status: 400 })
  }

  const term = (body.term ?? '').trim().slice(0, 60)
  if (!term) return NextResponse.json({ error: '검색어가 필요합니다.' }, { status: 400 })
  if (!validSubscription(body.subscription)) {
    return NextResponse.json(
      { error: '브라우저에서 받은 알림 구독 정보를 읽지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.' },
      { status: 400 },
    )
  }

  const scope: MarketScope = body.scope === 'overseas' ? 'overseas' : 'domestic'
  const result = await createAlert({
    subscription: body.subscription,
    term,
    scope,
    filters: (body.filters ?? {}) as never,
  })

  if (!result.ok) {
    if (result.reason === 'limit') {
      return NextResponse.json(
        { error: '알림은 최대 20개까지 등록할 수 있습니다. 쓰지 않는 알림을 지워주세요.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: '알림을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503 },
    )
  }
  return NextResponse.json({ ok: true, id: result.id, created: result.created })
}

/** 이 브라우저가 등록한 알림 목록 */
export async function PUT(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: '요청을 이해하지 못했습니다.' }, { status: 400 })
  }
  const endpoint = body.subscription?.endpoint
  if (!endpoint || !isAllowedEndpoint(endpoint)) {
    return NextResponse.json({ items: [] })
  }
  const items = await listAlerts(endpoint)
  return NextResponse.json({
    items: items.map((a) => ({
      id: a.id,
      term: a.term,
      scope: a.scope,
      filters: a.filters,
      notifyCount: a.notifyCount,
      lastNotifiedAt: a.lastNotifiedAt,
      createdAt: a.createdAt,
    })),
  })
}

export async function DELETE(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: '요청을 이해하지 못했습니다.' }, { status: 400 })
  }
  const endpoint = body.subscription?.endpoint
  if (!endpoint || !isAllowedEndpoint(endpoint)) {
    return NextResponse.json({ error: '어떤 알림을 지울지 알 수 없습니다.' }, { status: 400 })
  }
  if (body.id === undefined) {
    const n = await deleteAllAlerts(endpoint)
    return NextResponse.json({ ok: true, deleted: n })
  }
  const ok = await deleteAlert(endpoint, Number(body.id))
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 })
}
