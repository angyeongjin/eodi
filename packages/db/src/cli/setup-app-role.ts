/**
 * 서비스 연결 전용 role 을 만든다.
 *
 * 왜 나누나 — 웹 앱은 런타임에 SELECT/INSERT/UPDATE/DELETE 만 한다.
 * 테이블을 만들거나 지울 일이 없다. 그런데 오너 계정으로 붙여두면
 * 애플리케이션에 SQL 인젝션 같은 구멍이 하나만 나도 스키마를 통째로 날릴 수 있다.
 * 앱에는 앱이 할 수 있는 만큼만 준다.
 *
 * 이 role 은 **SQL 로 만든다.** Neon 콘솔에서 만들면 neon_superuser 멤버십이 붙어
 * 확장 설치까지 가능해지므로 최소권한이라는 목적 자체가 없어진다.
 *
 *   DATABASE_URL_OWNER=... npm run db:setup-app-role
 *
 * 만든 접속 문자열은 화면에 찍지 않고 .env 의 DATABASE_URL 로 바로 써넣는다.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { envOptional, envStr } from '@eodi/core'

const APP_ROLE = envStr('APP_ROLE', 'eodi_app')

/*
  role 이름은 SQL 식별자로 그대로 들어간다 — 파라미터 바인딩이 안 되는 자리다.
  그래서 값을 믿지 않고 형태를 강제한다. 이걸 안 하면 APP_ROLE 이 곧 인젝션 통로가 된다.
*/
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(APP_ROLE)) {
  console.error(`APP_ROLE 이 올바르지 않습니다: "${APP_ROLE}"`)
  console.error('소문자·숫자·밑줄만, 첫 글자는 문자나 밑줄이어야 합니다.')
  process.exit(1)
}
const ownerUrl = envOptional('DATABASE_URL_OWNER') ?? envOptional('DATABASE_URL')

if (!ownerUrl) {
  console.error('오너 접속 정보가 없습니다.')
  console.error('.env 의 DATABASE_URL_OWNER 에 Neon 콘솔에서 받은 커넥션 스트링을 넣으세요.')
  process.exit(1)
}

/** 비밀번호에 URL 예약문자가 섞이면 커넥션 스트링이 깨진다. 안전한 문자만 쓴다. */
function newPassword(): string {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return [...randomBytes(32)].map((b) => abc[b % abc.length]).join('')
}

function mask(url: string): string {
  try {
    const u = new URL(url)
    return `${u.username}:****@${u.hostname}${u.pathname}`
  } catch {
    return '(해석 불가)'
  }
}

const sql = postgres(ownerUrl, {
  max: 1,
  ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(ownerUrl) ? false : 'require',
  onnotice: () => {},
})

const password = newPassword()

try {
  const dbRows = await sql<Array<{ current_database: string }>>`SELECT current_database()`
  const db = dbRows[0]?.current_database
  if (!db) throw new Error('현재 데이터베이스 이름을 읽지 못했습니다')
  console.log(`오너로 접속: ${mask(ownerUrl)}`)

  const exists = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${APP_ROLE}`
  if (exists.length > 0) {
    await sql.unsafe(`ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${password}'`)
    console.log(`역할 ${APP_ROLE}: 이미 있어 비밀번호만 교체`)
  } else {
    await sql.unsafe(`CREATE ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${password}'`)
    console.log(`역할 ${APP_ROLE}: 생성`)
  }

  /*
    딱 필요한 만큼만 준다.
    ALTER DEFAULT PRIVILEGES 가 핵심이다 — 이걸 빼먹으면 다음에 테이블을 추가했을 때
    앱이 그 테이블만 못 읽어서, 원인 찾기 어려운 장애가 난다.
  */
  const grants = [
    `GRANT CONNECT ON DATABASE ${db} TO ${APP_ROLE}`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`,
  ]
  for (const g of grants) await sql.unsafe(g)
  console.log('권한 부여: SELECT/INSERT/UPDATE/DELETE + 시퀀스 + 앞으로 만들 테이블까지')

  // 못 하는 것도 확인해 둔다 — 최소권한이 실제로 최소인지
  const privRows = await sql<Array<{ can_create: boolean }>>`
    SELECT has_schema_privilege(${APP_ROLE}, 'public', 'CREATE') AS can_create
  `
  const canCreate = privRows[0]?.can_create ?? false
  console.log(`스키마 CREATE 권한: ${canCreate ? '⚠️ 있음' : '없음 ✅ (테이블 생성·삭제 불가)'}`)

  const appUrl = (() => {
    const u = new URL(ownerUrl)
    u.username = APP_ROLE
    u.password = password
    return u.toString()
  })()

  // 비밀번호를 화면에 찍지 않고 .env 에 직접 쓴다
  const here = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(here, '../../../../.env')
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    let replaced = false
    const next = lines.map((l) => {
      if (/^DATABASE_URL=/.test(l)) {
        replaced = true
        return `DATABASE_URL=${appUrl}`
      }
      return l
    })
    if (!replaced) next.push(`DATABASE_URL=${appUrl}`)
    writeFileSync(envPath, next.join('\n'), 'utf-8')
    console.log(`\n.env 의 DATABASE_URL 을 앱 전용 계정으로 교체했습니다 → ${mask(appUrl)}`)
    console.log('비밀번호는 화면에 찍지 않았습니다. .env 에만 있습니다.')
  } else {
    console.log(`\n.env 를 찾지 못했습니다: ${envPath}`)
    console.log('아래 값을 직접 넣으세요 (비밀번호 포함):')
    console.log(`DATABASE_URL=${appUrl}`)
  }

  console.log('\n다음: Vercel 환경변수의 DATABASE_URL 도 이 값으로 바꾸세요.')
  console.log('오너 계정(DATABASE_URL_OWNER)은 마이그레이션에만 쓰고 배포에는 넣지 않습니다.')
} catch (err) {
  console.error('\n실패:', err instanceof Error ? err.message : err)
  console.error('오너 role 이 맞는지 확인하세요. Neon 콘솔에서 만든 role 이어야 CREATE ROLE 이 됩니다.')
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
