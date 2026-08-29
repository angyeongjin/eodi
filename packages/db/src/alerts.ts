import { createHash } from 'node:crypto'
import type { MarketScope, SearchFilters } from '@eodi/core'
import { tryDb } from './client.js'

/**
 * 키워드 알림 저장소.
 *
 * 계정이 없다. 브라우저의 푸시 구독이 곧 신원이다.
 * 그래서 이메일·이름 같은 개인정보를 한 줄도 갖지 않는다 — 우리가 안 가지면 유출될 것도 없다.
 */

export interface PushSubscriptionJson {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface AlertRow {
  id: number
  subscription: PushSubscriptionJson
  term: string
  scope: MarketScope
  filters: SearchFilters
  seenIds: string[]
  failCount: number
  /** 한 번이라도 확인한 적이 있는지. "첫 실행" 판정의 유일한 근거다 */
  lastCheckedAt: Date | null
  lastNotifiedAt: Date | null
  notifyCount: number
  createdAt: Date
}

/** endpoint 원문 대신 해시를 키로 쓴다. 로그에 흘러도 재사용할 수 없다. */
export function endpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 40)
}

/** 알림 한 사람이 만들 수 있는 최대 개수. 이걸 안 걸면 한 브라우저가 큐를 다 먹는다. */
export const MAX_ALERTS_PER_SUBSCRIPTION = 20

export interface CreateAlertInput {
  subscription: PushSubscriptionJson
  term: string
  scope: MarketScope
  filters?: SearchFilters
}

export type CreateAlertResult =
  | { ok: true; id: number; created: boolean }
  | { ok: false; reason: 'limit' | 'db' }

export async function createAlert(input: CreateAlertInput): Promise<CreateAlertResult> {
  const hash = endpointHash(input.subscription.endpoint)
  return tryDb<CreateAlertResult>(
    async (sql) => {
      const [{ count } = { count: '0' }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::text AS count FROM alert WHERE endpoint_hash = ${hash} AND active
      `
      const existing = await sql<Array<{ id: number }>>`
        SELECT id FROM alert
        WHERE endpoint_hash = ${hash} AND term = ${input.term} AND scope = ${input.scope}
      `
      if (existing.length === 0 && Number(count) >= MAX_ALERTS_PER_SUBSCRIPTION) {
        return { ok: false, reason: 'limit' }
      }

      const rows = await sql<Array<{ id: number; created: boolean }>>`
        INSERT INTO alert (endpoint_hash, subscription, term, scope, filters)
        VALUES (${hash}, ${sql.json(input.subscription as never)}, ${input.term}, ${input.scope},
                ${sql.json((input.filters ?? {}) as never)})
        ON CONFLICT (endpoint_hash, term, scope) DO UPDATE
          SET subscription = EXCLUDED.subscription,
              filters      = EXCLUDED.filters,
              active       = TRUE,
              fail_count   = 0
        RETURNING id, (xmax = 0) AS created
      `
      const row = rows[0]
      if (!row) return { ok: false, reason: 'db' }
      return { ok: true, id: Number(row.id), created: row.created }
    },
    { ok: false, reason: 'db' },
  )
}

export async function listAlerts(endpoint: string): Promise<AlertRow[]> {
  const hash = endpointHash(endpoint)
  return tryDb(async (sql) => {
    const rows = await sql<Array<Record<string, unknown>>>`
      SELECT id, subscription, term, scope, filters, seen_ids, fail_count,
             last_checked_at, last_notified_at, notify_count, created_at
      FROM alert WHERE endpoint_hash = ${hash} AND active
      ORDER BY created_at DESC
    `
    return rows.map(toAlertRow)
  }, [])
}

/** 이번 회차에 확인할 알림들. 오래 안 본 것부터 */
export async function dueAlerts(limit = 200): Promise<AlertRow[]> {
  return tryDb(async (sql) => {
    const rows = await sql<Array<Record<string, unknown>>>`
      SELECT id, subscription, term, scope, filters, seen_ids, fail_count,
             last_checked_at, last_notified_at, notify_count, created_at
      FROM alert WHERE active
      ORDER BY last_checked_at ASC NULLS FIRST
      LIMIT ${limit}
    `
    return rows.map(toAlertRow)
  }, [])
}

function toAlertRow(r: Record<string, unknown>): AlertRow {
  return {
    id: Number(r['id']),
    subscription: r['subscription'] as PushSubscriptionJson,
    term: String(r['term']),
    scope: (r['scope'] as MarketScope) ?? 'domestic',
    filters: (r['filters'] as SearchFilters) ?? {},
    seenIds: (r['seen_ids'] as string[]) ?? [],
    failCount: Number(r['fail_count'] ?? 0),
    lastCheckedAt: (r['last_checked_at'] as Date | null) ?? null,
    lastNotifiedAt: (r['last_notified_at'] as Date | null) ?? null,
    notifyCount: Number(r['notify_count'] ?? 0),
    createdAt: (r['created_at'] as Date) ?? new Date(),
  }
}

export async function markChecked(id: number, seenIds: string[], notified: boolean): Promise<void> {
  await tryDb(async (sql) => {
    await sql`
      UPDATE alert SET
        seen_ids         = ${seenIds},
        last_checked_at  = NOW(),
        fail_count       = 0,
        last_notified_at = ${notified ? sql`NOW()` : sql`last_notified_at`},
        notify_count     = notify_count + ${notified ? 1 : 0}
      WHERE id = ${id}
    `
    return undefined
  }, undefined)
}

/**
 * 발송 실패 기록.
 * 구독이 확실히 죽은 경우(410 Gone / 404)는 바로 끈다 —
 * 죽은 구독을 계속 두드리면 푸시 서비스가 우리를 차단한다.
 */
export async function markFailed(id: number, gone: boolean): Promise<void> {
  await tryDb(async (sql) => {
    if (gone) {
      await sql`UPDATE alert SET active = FALSE, last_checked_at = NOW() WHERE id = ${id}`
    } else {
      await sql`
        UPDATE alert SET fail_count = fail_count + 1, last_checked_at = NOW(),
                         active = (fail_count + 1 < 5)
        WHERE id = ${id}
      `
    }
    return undefined
  }, undefined)
}

export async function deleteAlert(endpoint: string, id: number): Promise<boolean> {
  const hash = endpointHash(endpoint)
  return tryDb(async (sql) => {
    const rows = await sql`DELETE FROM alert WHERE id = ${id} AND endpoint_hash = ${hash} RETURNING id`
    return rows.length > 0
  }, false)
}

/** 구독 전체 해제 (브라우저 알림 권한을 껐을 때) */
export async function deleteAllAlerts(endpoint: string): Promise<number> {
  const hash = endpointHash(endpoint)
  return tryDb(async (sql) => {
    const rows = await sql`DELETE FROM alert WHERE endpoint_hash = ${hash} RETURNING id`
    return rows.length
  }, 0)
}

export interface AlertStats {
  total: number
  active: number
  notified24h: number
}

export async function alertStats(): Promise<AlertStats> {
  return tryDb(
    async (sql) => {
      const [r] = await sql<Array<{ total: string; active: string; recent: string }>>`
        SELECT COUNT(*)::text AS total,
               COUNT(*) FILTER (WHERE active)::text AS active,
               COUNT(*) FILTER (WHERE last_notified_at > NOW() - INTERVAL '24 hours')::text AS recent
        FROM alert
      `
      return { total: Number(r?.total ?? 0), active: Number(r?.active ?? 0), notified24h: Number(r?.recent ?? 0) }
    },
    { total: 0, active: 0, notified24h: 0 },
  )
}
