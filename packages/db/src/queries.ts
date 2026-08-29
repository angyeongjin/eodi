import type { EventInput, EventSurface, MarketScope, SourceId, SourceStatus } from '@eodi/core'
import { tryDb } from './client.js'
import { MemoryCounter, MemoryTermCounter, MemoryMetrics } from './memory.js'

const memCounter = new MemoryCounter()
const memUntranslated = new MemoryTermCounter()
const memMetrics = new MemoryMetrics()

export interface LogQueryInput {
  term: string
  normalized: string
  productId?: string | null
  resultCount: number
  tookMs: number
  cached: boolean
  /** 어느 탭에서 검색했는지. 해외 탭 이용 비중이 런치 성공 판단 기준이다 */
  scope?: MarketScope
}

/** 검색 로그 — 인기 검색어와 예열 대상의 원천 */
export async function logQuery(input: LogQueryInput): Promise<void> {
  const scope: MarketScope = input.scope ?? 'domestic'
  if (input.normalized) memCounter.add(input.normalized, input.term)
  memMetrics.addSearch(scope, input.normalized, input.term, input.resultCount)

  await tryDb(async (sql) => {
    await sql`
      INSERT INTO query_log (term, normalized, product_id, result_count, took_ms, cached, scope)
      VALUES (${input.term}, ${input.normalized}, ${input.productId ?? null},
              ${input.resultCount}, ${Math.round(input.tookMs)}, ${input.cached}, ${scope})
    `
    return undefined
  }, undefined)
}

export interface PopularQuery {
  term: string
  count: number
}

/** 최근 N일 인기 검색어 */
export async function popularQueries(limit = 12, days = 7): Promise<PopularQuery[]> {
  const fromDb = await tryDb<PopularQuery[]>(async (sql) => {
    const rows = await sql<Array<{ term: string; count: string }>>`
      SELECT MIN(term) AS term, COUNT(*)::text AS count
      FROM query_log
      WHERE created_at > NOW() - ${`${days} days`}::interval
        AND result_count > 0
      GROUP BY normalized
      ORDER BY COUNT(*) DESC
      LIMIT ${limit}
    `
    return rows.map((r) => ({ term: r.term, count: Number(r.count) }))
  }, [])

  return fromDb.length > 0 ? fromDb : memCounter.top(limit)
}

/** 소스 상태 기록 */
export async function recordSourceHealth(statuses: readonly SourceStatus[]): Promise<void> {
  if (statuses.length === 0) return
  await tryDb(async (sql) => {
    const rows = statuses.map((s) => ({
      source: s.source,
      ok: s.ok,
      count: s.count,
      duration_ms: Math.round(s.durationMs),
      error: s.error ?? null,
    }))
    await sql`INSERT INTO source_health ${sql(rows, 'source', 'ok', 'count', 'duration_ms', 'error')}`
    return undefined
  }, undefined)
}

export interface SourceHealthSummary {
  source: string
  okRate: number
  avgDurationMs: number
  lastError: string | null
  samples: number
}

/** 최근 소스 건강 상태 — 운영 페이지에 띄운다 */
export async function sourceHealthSummary(hours = 24): Promise<SourceHealthSummary[]> {
  return tryDb(async (sql) => {
    const rows = await sql<
      Array<{ source: string; ok_rate: string; avg_ms: string; last_error: string | null; samples: string }>
    >`
      SELECT source,
             AVG(CASE WHEN ok THEN 1.0 ELSE 0.0 END)::text AS ok_rate,
             AVG(duration_ms)::text AS avg_ms,
             (ARRAY_AGG(error ORDER BY created_at DESC) FILTER (WHERE error IS NOT NULL))[1] AS last_error,
             COUNT(*)::text AS samples
      FROM source_health
      WHERE created_at > NOW() - ${`${hours} hours`}::interval
      GROUP BY source
    `
    return rows.map((r) => ({
      source: r.source,
      okRate: Number(r.ok_rate),
      avgDurationMs: Math.round(Number(r.avg_ms)),
      lastError: r.last_error,
      samples: Number(r.samples),
    }))
  }, [])
}

/** 오래된 로그 정리 */
export async function pruneOldLogs(days = 180): Promise<void> {
  await tryDb(async (sql) => {
    await sql`DELETE FROM query_log WHERE created_at < NOW() - ${`${days} days`}::interval`
    await sql`DELETE FROM source_health WHERE created_at < NOW() - ${'14 days'}::interval`
    // 이벤트도 같은 주기로 지운다. 개별 행은 집계 뒤에는 쓸모가 없고,
    // 오래 쌓아둘수록 "사람을 식별하지 않는다"는 약속만 약해진다.
    await sql`DELETE FROM event WHERE created_at < NOW() - ${`${days} days`}::interval`
    return undefined
  }, undefined)
}

/**
 * 번역하지 못한 한글 검색어를 쌓는다.
 * 굿즈 사전을 무엇으로 채워야 하는지 알려주는 유일한 신호라 반드시 남긴다.
 */
export async function recordUntranslated(terms: readonly string[]): Promise<void> {
  const clean = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2 && t.length <= 40))]
  if (clean.length === 0) return
  for (const term of clean) memUntranslated.add(term)
  await tryDb(async (sql) => {
    for (const term of clean) {
      await sql`
        INSERT INTO untranslated_term (term) VALUES (${term})
        ON CONFLICT (term) DO UPDATE
          SET hits = untranslated_term.hits + 1, last_seen = NOW()
      `
    }
    return undefined
  }, undefined)
}

/**
 * 이제는 옮길 수 있게 된 말을 목록에서 내린다.
 *
 * 사전에 넣어도 예전 기록은 그대로 남아, 보강 대상 상위가 이미 해결된 말로 채워졌다.
 * 무엇을 아는지는 도메인 쪽이 판단하고, 여기서는 받은 목록만 닫는다.
 */
export async function resolveUntranslated(terms: readonly string[]): Promise<number> {
  const clean = [...new Set(terms.map((t) => t.trim()).filter(Boolean))]
  if (clean.length === 0) return 0
  return tryDb(async (sql) => {
    const rows = await sql`
      UPDATE untranslated_term SET resolved = TRUE
      WHERE NOT resolved AND term = ANY(${clean})
      RETURNING term
    `
    return rows.length
  }, 0)
}

/** 아직 해결되지 않은 미번역어 전체 (정리 작업용) */
export async function allUnresolvedTerms(): Promise<string[]> {
  return tryDb(async (sql) => {
    const rows = await sql<Array<{ term: string }>>`SELECT term FROM untranslated_term WHERE NOT resolved`
    return rows.map((r) => r.term)
  }, [])
}

export interface UntranslatedTerm {
  term: string
  hits: number
  lastSeen: Date
}

/** 사전 보강 우선순위 — 많이 검색됐는데 아직 못 옮기는 말부터 */
export async function topUntranslated(limit = 50): Promise<UntranslatedTerm[]> {
  const fromDb = await tryDb(async (sql) => {
    const rows = await sql<Array<{ term: string; hits: number; last_seen: Date }>>`
      SELECT term, hits, last_seen FROM untranslated_term
      WHERE NOT resolved
      ORDER BY hits DESC, last_seen DESC
      LIMIT ${limit}
    `
    return rows.map((r) => ({ term: r.term, hits: r.hits, lastSeen: r.last_seen }))
  }, [])
  // popularQueries 와 같은 규칙: DB 가 비었거나 없으면 이번 프로세스가 본 것이라도 보여준다
  return fromDb.length > 0 ? fromDb : memUntranslated.top(limit)
}

/**
 * 화면에서 일어난 행동을 기록한다.
 *
 * 실패해도 조용히 넘어간다(`tryDb`). 계측이 사용자의 클릭을 막아서는 안 된다 —
 * 우리가 세지 못하는 것보다 사용자가 원본으로 못 가는 것이 훨씬 나쁘다.
 */
export async function recordEvent(input: EventInput): Promise<void> {
  memMetrics.addClick(input.scope, input.surface, input.source, input.position)

  await tryDb(async (sql) => {
    await sql`
      INSERT INTO event (kind, scope, surface, source, position, normalized)
      VALUES (${input.kind}, ${input.scope}, ${input.surface}, ${input.source},
              ${input.position}, ${input.normalized})
    `
    return undefined
  }, undefined)
}

export interface OutboundStats {
  days: number
  searches: number
  /** 모든 화면에서 나간 클릭 */
  clicks: number
  /** 그중 검색 결과에서 나간 클릭 — 클릭률의 분자는 이것뿐이다 */
  searchClicks: number
  /** 검색 결과 클릭 / 검색 */
  ctr: number
  /** 탭별. clicks 는 검색 결과에서 나간 클릭만 센다 (클릭률의 분자와 같은 기준) */
  byScope: Array<{ scope: MarketScope; searches: number; clicks: number; ctr: number }>
  bySurface: Array<{ surface: EventSurface; clicks: number }>
  bySource: Array<{ source: SourceId; clicks: number; share: number }>
  /** 순위별 클릭 (순위 오름차순). 순위가 없는 클릭은 빠진다 */
  byPosition: Array<{ position: number; clicks: number }>
  /** 순위가 기록된 클릭 수 — byPosition 의 분모 */
  positionedClicks: number
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

/**
 * "찾아준 것이 실제로 쓸모 있었는가"에 답하는 숫자.
 *
 * 원본 클릭률은 랭킹을 고칠 근거이자 마켓 제휴 제안의 유일한 물증이고,
 * 탭별 비중은 굿즈 타깃 가설이 맞았는지를 말해준다.
 * 둘 다 런치 플랜의 성공/실패 판단 기준(클릭률 25%, 해외 탭 10%)에 그대로 들어간다.
 */
export async function outboundStats(days = 7): Promise<OutboundStats> {
  const interval = `${days} days`

  const fromDb = await tryDb<OutboundStats | null>(async (sql) => {
    const searchRows = await sql<Array<{ scope: string; n: string }>>`
      SELECT scope, COUNT(*)::text AS n
      FROM query_log
      WHERE created_at > NOW() - ${interval}::interval
      GROUP BY scope
    `
    const clickRows = await sql<
      Array<{ scope: string; surface: string; source: string | null; n: string }>
    >`
      SELECT scope, surface, source, COUNT(*)::text AS n
      FROM event
      WHERE kind = 'outbound' AND created_at > NOW() - ${interval}::interval
      GROUP BY scope, surface, source
    `
    const positionRows = await sql<Array<{ position: number; n: string }>>`
      SELECT position, COUNT(*)::text AS n
      FROM event
      WHERE kind = 'outbound' AND position IS NOT NULL
        AND created_at > NOW() - ${interval}::interval
      GROUP BY position
      ORDER BY position ASC
      LIMIT 20
    `

    const searchByScope = new Map<string, number>()
    for (const r of searchRows) searchByScope.set(r.scope, Number(r.n))

    const clickByScope = new Map<string, number>()
    // 탭별 클릭률의 분자도 검색 결과 클릭이어야 한다. 안 나누면 랜딩·피드 클릭이 섞여 100% 를 넘는다.
    const searchClickByScope = new Map<string, number>()
    const clickBySurface = new Map<string, number>()
    const clickBySource = new Map<string, number>()
    for (const r of clickRows) {
      const n = Number(r.n)
      clickByScope.set(r.scope, (clickByScope.get(r.scope) ?? 0) + n)
      if (r.surface === 'search') {
        searchClickByScope.set(r.scope, (searchClickByScope.get(r.scope) ?? 0) + n)
      }
      clickBySurface.set(r.surface, (clickBySurface.get(r.surface) ?? 0) + n)
      if (r.source) clickBySource.set(r.source, (clickBySource.get(r.source) ?? 0) + n)
    }

    const searches = [...searchByScope.values()].reduce((a, b) => a + b, 0)
    const clicks = [...clickByScope.values()].reduce((a, b) => a + b, 0)
    const searchClicks = clickBySurface.get('search') ?? 0
    const byPosition = positionRows.map((r) => ({ position: r.position, clicks: Number(r.n) }))

    return {
      days,
      searches,
      clicks,
      searchClicks,
      // 분자는 검색 결과에서 나간 클릭만. 랜딩·홈 피드 클릭은 분모가 되는 검색이 없다.
      ctr: ratio(searchClicks, searches),
      byScope: (['domestic', 'overseas'] as const).map((scope) => {
        const s = searchByScope.get(scope) ?? 0
        const c = searchClickByScope.get(scope) ?? 0
        return { scope, searches: s, clicks: c, ctr: ratio(c, s) }
      }),
      bySurface: (['search', 'landing', 'feed'] as const).map((surface) => ({
        surface,
        clicks: clickBySurface.get(surface) ?? 0,
      })),
      bySource: [...clickBySource.entries()]
        .map(([source, n]) => ({ source: source as SourceId, clicks: n, share: ratio(n, clicks) }))
        .sort((a, b) => b.clicks - a.clicks),
      byPosition,
      positionedClicks: byPosition.reduce((a, b) => a + b.clicks, 0),
    }
  }, null)

  if (fromDb && (fromDb.searches > 0 || fromDb.clicks > 0)) return fromDb

  // DB 가 없거나 아직 아무것도 안 쌓였으면 이번 프로세스가 본 것이라도 보여준다
  const clicks = memMetrics.clickCount()
  const searches = memMetrics.searchCount()
  const searchClicks = memMetrics.clickCountBySurface('search')
  const byPosition = memMetrics.clicksByPosition()
  return {
    days,
    searches,
    clicks,
    searchClicks,
    ctr: ratio(searchClicks, searches),
    byScope: (['domestic', 'overseas'] as const).map((scope) => {
      const s = memMetrics.searchCount(scope)
      const c = memMetrics.searchClickCount(scope)
      return { scope, searches: s, clicks: c, ctr: ratio(c, s) }
    }),
    bySurface: (['search', 'landing', 'feed'] as const).map((surface) => ({
      surface,
      clicks: memMetrics.clickCountBySurface(surface),
    })),
    bySource: memMetrics
      .clicksBySourceTop()
      .map((r) => ({ source: r.source as SourceId, clicks: r.clicks, share: ratio(r.clicks, clicks) })),
    byPosition,
    positionedClicks: byPosition.reduce((a, b) => a + b.clicks, 0),
  }
}

export interface ZeroResultQuery {
  term: string
  scope: MarketScope
  count: number
  lastSeen: Date
}

/**
 * 결과가 0건이었던 검색어.
 *
 * 사용자가 찾으러 왔는데 우리가 못 준 말들이고, 그래서 카탈로그·별칭·굿즈 사전의
 * 다음 보강 대상이다. `untranslated_term` 은 "일본어로 못 옮긴 말"만 잡는 반면
 * 이쪽은 **옮겼는데도 매물이 없었던 경우까지** 포함한다.
 */
export async function zeroResultQueries(limit = 30, days = 7): Promise<ZeroResultQuery[]> {
  const fromDb = await tryDb<ZeroResultQuery[]>(async (sql) => {
    const rows = await sql<Array<{ term: string; scope: string; n: string; last_seen: Date }>>`
      SELECT MIN(term) AS term, scope, COUNT(*)::text AS n, MAX(created_at) AS last_seen
      FROM query_log
      WHERE created_at > NOW() - ${`${days} days`}::interval
        AND result_count = 0
        AND normalized <> ''
      GROUP BY normalized, scope
      ORDER BY COUNT(*) DESC, MAX(created_at) DESC
      LIMIT ${limit}
    `
    return rows.map((r) => ({
      term: r.term,
      scope: (r.scope === 'overseas' ? 'overseas' : 'domestic') as MarketScope,
      count: Number(r.n),
      lastSeen: r.last_seen,
    }))
  }, [])

  if (fromDb.length > 0) return fromDb
  return memMetrics.zeroTop(limit).map((z) => ({
    term: z.term,
    scope: (z.scope === 'overseas' ? 'overseas' : 'domestic') as MarketScope,
    count: z.count,
    lastSeen: z.lastSeen,
  }))
}
