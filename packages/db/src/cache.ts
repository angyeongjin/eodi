import { createHash } from 'node:crypto'
import { envNum, type RawListing, type SourceStatus } from '@eodi/core'
import { getSql, tryDb } from './client.js'
import { MemoryTtlMap } from './memory.js'

export interface CachedSearch {
  listings: RawListing[]
  sources: SourceStatus[]
  createdAt: Date
}

/** 기본 TTL 10분 — 중고 매물은 분 단위로 뒤집히진 않지만 하루면 낡는다 */
export const DEFAULT_TTL_MS = envNum('SEARCH_CACHE_TTL_MS', 10 * 60 * 1000)

/**
 * 신선 기한이 지난 뒤에도 답으로 쓸 수 있는 시간.
 *
 * 10분이 지났다고 캐시를 버리면 그다음 사람은 다시 4초를 기다린다. 그런데 그 4초를
 * 기다려서 얻는 차이는 대개 "매물 몇 건이 더 올라왔다" 정도다. 그래서 낡은 답을 먼저 주고
 * 새 결과는 뒤에서 받아 다음 사람에게 넘긴다(stale-while-revalidate).
 *
 * 이 시간을 넘긴 캐시는 쓰지 않는다. 팔린 매물이 남아 있을 확률이 그만큼 커지기 때문이다.
 */
export const STALE_MS = envNum('SEARCH_CACHE_STALE_MS', 20 * 60 * 1000)

/** 캐시가 아직 신선한가 — 낡았어도 STALE_MS 안이면 답으로는 쓸 수 있다 */
export function isCacheFresh(createdAt: Date, ttlMs: number = DEFAULT_TTL_MS): boolean {
  return Date.now() - createdAt.getTime() <= ttlMs
}

const memory = new MemoryTtlMap<CachedSearch>(300)

export function cacheKey(term: string, extra: Record<string, unknown> = {}): string {
  const payload = JSON.stringify({ t: term.trim().toLowerCase(), ...extra })
  return createHash('sha1').update(payload).digest('hex').slice(0, 32)
}

/**
 * 직렬화된 Date 를 되살린다.
 *
 * 날짜 필드를 하나씩 손으로 적으면 새 필드가 생길 때마다 빠뜨린다
 * (실제로 endsAt 을 빠뜨려 캐시 히트 시에만 문자열이 흘러들어간 적이 있다).
 * 목록을 한곳에 모아두고 전부 순회한다.
 */
const DATE_FIELDS = ['postedAt', 'endsAt'] as const satisfies ReadonlyArray<keyof RawListing>

function reviveListings(rows: unknown): RawListing[] {
  if (!Array.isArray(rows)) return []
  return rows.map((r) => {
    const o = { ...(r as RawListing) } as Record<string, unknown>
    for (const f of DATE_FIELDS) {
      const v = o[f]
      if (typeof v === 'string') {
        const d = new Date(v)
        if (!Number.isNaN(d.getTime())) o[f] = d
        else delete o[f]
      }
    }
    return o as unknown as RawListing
  })
}

export async function getCachedSearch(key: string): Promise<CachedSearch | null> {
  const mem = memory.get(key)
  if (mem) return mem

  return tryDb(async (sql) => {
    const rows = await sql<Array<{ payload: unknown; sources: unknown; created_at: Date }>>`
      SELECT payload, sources, created_at
      FROM search_cache
      WHERE key = ${key} AND expires_at > NOW()
      LIMIT 1
    `
    const row = rows[0]
    if (!row) return null
    const value: CachedSearch = {
      listings: reviveListings(row.payload),
      sources: (row.sources as SourceStatus[]) ?? [],
      createdAt: row.created_at,
    }
    memory.set(key, value, DEFAULT_TTL_MS)
    return value
  }, null)
}

export async function setCachedSearch(
  key: string,
  term: string,
  listings: RawListing[],
  sources: SourceStatus[],
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  const value: CachedSearch = { listings, sources, createdAt: new Date() }
  // 신선 기한이 지나도 STALE_MS 동안은 답으로 쓰므로 그만큼 더 살려 둔다.
  // 신선한지 아닌지는 createdAt 으로 판단한다(isCacheFresh).
  memory.set(key, value, ttlMs + STALE_MS)

  await tryDb(async (sql) => {
    const expires = new Date(Date.now() + ttlMs + STALE_MS)
    await sql`
      INSERT INTO search_cache (key, term, payload, sources, expires_at)
      VALUES (${key}, ${term}, ${sql.json(listings as never)}, ${sql.json(sources as never)}, ${expires})
      ON CONFLICT (key) DO UPDATE
        SET payload = EXCLUDED.payload,
            sources = EXCLUDED.sources,
            created_at = NOW(),
            expires_at = EXCLUDED.expires_at
    `
    return undefined
  }, undefined)
}

/** 만료된 캐시 정리 — 크론이 호출한다 */
export async function purgeExpiredCache(): Promise<number> {
  return tryDb(async (sql) => {
    const rows = await sql<Array<{ count: string }>>`
      WITH deleted AS (DELETE FROM search_cache WHERE expires_at < NOW() RETURNING 1)
      SELECT COUNT(*)::text AS count FROM deleted
    `
    return Number(rows[0]?.count ?? 0)
  }, 0)
}

export function clearMemoryCache(): void {
  memory.clear()
}

export function memoryCacheSize(): number {
  return memory.size
}

export { getSql }
