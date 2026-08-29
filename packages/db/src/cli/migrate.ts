/** 스키마 적용. idempotent 하므로 몇 번을 돌려도 안전하다. */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOptional } from '@eodi/core'
import { getSql, closeSql } from '../client.js'

/*
  마이그레이션은 DDL 이라 **오너 계정**으로 붙는다.
  런타임용 DATABASE_URL 은 테이블을 만들 권한이 없으므로 여기서 쓰면 실패한다.
*/
const ownerUrl = envOptional('DATABASE_URL_OWNER') ?? envOptional('DATABASE_URL')
if (!ownerUrl) {
  console.error('DATABASE_URL_OWNER 가 없습니다. .env 에 Neon 오너 커넥션 스트링을 넣으세요.')
  console.error('DB 없이도 검색은 동작하지만 캐시·인덱스·알림은 비활성입니다.')
  process.exit(1)
}
process.env.DATABASE_URL = ownerUrl

const sql = getSql()
if (!sql) process.exit(1)

/** 접속 정보를 화면에 흘리지 않으면서 어디에 붙었는지는 알려준다 */
function describeTarget(url: string): string {
  try {
    const u = new URL(url)
    const pooled = u.hostname.includes('-pooler') ? ' (pooled ✅)' : ' (직접 연결 ⚠️ 서버리스에서는 pooled 권장)'
    return `${u.hostname}${u.pathname}${pooled}`
  } catch {
    return '(주소를 해석하지 못했습니다)'
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(here, '../schema.sql')
const ddl = readFileSync(schemaPath, 'utf-8')

console.log(`대상: ${describeTarget(ownerUrl)} (오너 계정)`)
console.log(`스키마: ${schemaPath}`)

try {
  await sql.unsafe(ddl)
  const [tables] = await sql<Array<{ n: string }>>`
    SELECT COUNT(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'
  `
  const [ext] = await sql<Array<{ n: string }>>`
    SELECT COUNT(*)::text AS n FROM pg_extension WHERE extname = 'pg_trgm'
  `
  console.log(`완료. public 테이블 ${tables?.n ?? '?'}개 · pg_trgm ${ext?.n === '1' ? '설치됨' : '없음'}`)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`\n마이그레이션 실패: ${msg}\n`)

  /*
    원인을 못 알아보면 사람은 엉뚱한 데를 고친다.
    Neon 에서 실제로 자주 걸리는 두 가지를 짚어준다.
  */
  if (/permission denied|must be owner|권한/i.test(msg) && /(table|relation|schema)/i.test(msg)) {
    console.error('원인으로 보이는 것: 런타임용 계정으로 마이그레이션을 시도했습니다.')
    console.error('  → .env 의 DATABASE_URL_OWNER 에 오너 커넥션 스트링을 넣으세요.')
    console.error('    (DATABASE_URL 은 앱 전용이라 테이블을 만들 수 없습니다 — 의도한 설계입니다)')
  } else if (/permission denied|must be owner|권한/i.test(msg) && /extension/i.test(msg)) {
    console.error('원인으로 보이는 것: 이 role 에 확장(pg_trgm) 설치 권한이 없습니다.')
    console.error('  Neon 콘솔·CLI·API 로 만든 role 은 neon_superuser 멤버십을 받아 설치할 수 있지만,')
    console.error('  SQL 로 직접 CREATE ROLE 한 계정은 기본 권한만 받습니다.')
    console.error('  → Neon 콘솔 Roles 탭에서 role 을 만들거나, 프로젝트 기본 role 을 쓰세요.')
  } else if (/password authentication failed|SASL/i.test(msg)) {
    console.error('원인으로 보이는 것: 비밀번호가 맞지 않습니다.')
    console.error('  → Neon 콘솔 Roles → 해당 role → Reset password 후 커넥션 스트링을 다시 복사하세요.')
  } else if (/ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) {
    console.error('원인으로 보이는 것: 호스트에 닿지 못했습니다.')
    console.error('  → 커넥션 스트링의 호스트와 ?sslmode=require 가 그대로인지 확인하세요.')
  }
  process.exitCode = 1
} finally {
  await closeSql()
}
