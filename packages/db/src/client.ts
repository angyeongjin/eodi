import postgres from 'postgres'
import { envNum, envOptional } from '@eodi/core'

/**
 * DB는 **선택 사항**이다.
 * 연합검색 자체는 DB 없이도 동작하므로, DATABASE_URL 이 없으면 메모리 드라이버로 떨어진다.
 * 덕분에 아무 설정 없이 `npm run dev` 만으로 서비스가 뜬다.
 */
export type Sql = postgres.Sql

let cached: Sql | null | undefined

export function getSql(): Sql | null {
  if (cached !== undefined) return cached
  const url = envOptional('DATABASE_URL')
  if (!url) {
    cached = null
    return null
  }
  cached = postgres(url, {
    max: envNum('DB_POOL_MAX', 3),
    idle_timeout: 20,
    connect_timeout: 10,
    // Neon/Supabase 는 TLS 필수. 로컬은 sslmode 를 URL 로 끌 수 있다.
    ssl: url.includes('sslmode=disable') || url.includes('localhost') || url.includes('127.0.0.1')
      ? false
      : 'require',
    onnotice: () => {},
  })
  return cached
}

export function hasDb(): boolean {
  return envOptional('DATABASE_URL') !== undefined
}

export async function closeSql(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 })
    cached = undefined
  }
}

/** DB 호출을 감싸 실패해도 서비스가 죽지 않게 한다 */
export async function tryDb<T>(fn: (sql: Sql) => Promise<T>, fallback: T): Promise<T> {
  const sql = getSql()
  if (!sql) return fallback
  try {
    return await fn(sql)
  } catch (err) {
    console.warn('[db] 쿼리 실패, 폴백으로 진행합니다:', err instanceof Error ? err.message : err)
    return fallback
  }
}
