import type { SourceStatus } from '@eodi/core'
import { tryDb } from './client.js'
import { MemoryCounter, MemoryTermCounter } from './memory.js'

const memCounter = new MemoryCounter()
const memUntranslated = new MemoryTermCounter()

export interface LogQueryInput {
  term: string
  normalized: string
  productId?: string | null
  resultCount: number
  tookMs: number
  cached: boolean
}

/** 검색 로그 — 인기 검색어와 예열 대상의 원천 */
export async function logQuery(input: LogQueryInput): Promise<void> {
  if (input.normalized) memCounter.add(input.normalized, input.term)

  await tryDb(async (sql) => {
    await sql`
      INSERT INTO query_log (term, normalized, product_id, result_count, took_ms, cached)
      VALUES (${input.term}, ${input.normalized}, ${input.productId ?? null},
              ${input.resultCount}, ${Math.round(input.tookMs)}, ${input.cached})
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
