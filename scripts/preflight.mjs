/**
 * 배포 전 점검.
 *
 * "배포 문서대로 했는데 안 돼요"를 막는 게 목적이다.
 * 환경변수·빌드 설정·비밀값 유출 여부를 실제로 확인한다.
 *
 *   node scripts/preflight.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync, execFileSync } from 'node:child_process'

/**
 * 검사 대상 파일 목록.
 *
 * git ls-files 만 믿으면 안 된다 — 아직 커밋 전이면 목록이 비어서
 * "0개 파일을 검사하고 통과"라는 무의미한 결과가 나온다. (실제로 그랬다)
 * 비어 있으면 파일시스템을 직접 걷는다.
 */
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.turbo'])
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full.replace(/^\.\//, ''))
  }
  return out
}
function projectFiles() {
  let tracked = []
  try {
    tracked = execSync('git ls-files', { encoding: 'utf-8' }).split('\n').filter(Boolean)
  } catch {
    tracked = []
  }
  if (tracked.length > 0) return { files: tracked, source: `git 추적 ${tracked.length}개` }
  const files = walk('.')
  return { files, source: `파일시스템 ${files.length}개 (아직 커밋 전)` }
}

let fail = 0
let warn = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { fail++; console.log(`  ❌ ${m}`) }
const caution = (m) => { warn++; console.log(`  ⚠️  ${m}`) }

console.log('\n[1] 환경변수')
const required = [
  ['NEXT_PUBLIC_SITE_URL', '사이트 절대 URL — 사이트맵·OG·알림 링크에 쓰입니다'],
]
const optional = [
  ['DATABASE_URL', '없으면 캐시·인덱스·알림이 비활성됩니다 (검색 자체는 동작)'],
  ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', '없으면 알림 등록 버튼이 실패합니다'],
  ['VAPID_PRIVATE_KEY', '없으면 알림 발송이 불가합니다'],
]
for (const [k, why] of required) {
  if (process.env[k]) ok(`${k} 설정됨`)
  else bad(`${k} 없음 — ${why}`)
}
for (const [k, why] of optional) {
  if (process.env[k]) ok(`${k} 설정됨`)
  else caution(`${k} 없음 — ${why}`)
}

if (process.env.NEXT_PUBLIC_SITE_URL) {
  const u = process.env.NEXT_PUBLIC_SITE_URL
  if (!u.startsWith('https://')) bad(`NEXT_PUBLIC_SITE_URL 이 https 가 아닙니다 (${u}) — 서비스워커·웹푸시가 동작하지 않습니다`)
  else ok('사이트 URL 이 https')
  if (u.endsWith('/')) caution('NEXT_PUBLIC_SITE_URL 끝에 / 가 있습니다. 링크가 //로 겹칠 수 있습니다')
}

/*
  도메인 전환 설정. 옛 호스트에 새 호스트가 섞이면 사이트 전체가 무한 리다이렉트로 죽는다.
  배포 전에 여기서 잡는다.
*/
if (process.env.LEGACY_HOSTS) {
  const hosts = process.env.LEGACY_HOSTS.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    bad('LEGACY_HOSTS 가 있는데 NEXT_PUBLIC_SITE_URL 이 없습니다 — 어디로 보낼지 알 수 없어 리다이렉트가 만들어지지 않습니다')
  } else {
    let canonicalHost = ''
    try {
      canonicalHost = new URL(process.env.NEXT_PUBLIC_SITE_URL).host.toLowerCase()
    } catch {
      bad('NEXT_PUBLIC_SITE_URL 을 주소로 해석하지 못했습니다')
    }
    if (canonicalHost && hosts.includes(canonicalHost)) {
      bad(`LEGACY_HOSTS 에 현재 호스트(${canonicalHost})가 들어 있습니다 — 무한 리다이렉트가 됩니다`)
    } else if (canonicalHost) {
      ok(`옛 호스트 ${hosts.length}개를 ${canonicalHost} 로 301`)
    }
  }
}

// 런타임 계정과 오너 계정이 같으면 최소권한이 아니다
if (process.env.DATABASE_URL && process.env.DATABASE_URL_OWNER) {
  if (process.env.DATABASE_URL === process.env.DATABASE_URL_OWNER) {
    caution('DATABASE_URL 이 오너 계정과 같습니다 — `npm run db:setup-app-role` 로 앱 전용 계정을 만드세요')
  } else {
    try {
      const appUser = new URL(process.env.DATABASE_URL).username
      const ownerUser = new URL(process.env.DATABASE_URL_OWNER).username
      if (appUser === ownerUser) caution(`런타임과 마이그레이션이 같은 계정(${appUser})을 씁니다`)
      else ok(`DB 계정 분리됨 (런타임 ${appUser} / 오너 ${ownerUser})`)
    } catch { caution('DATABASE_URL 형식을 해석하지 못했습니다') }
  }
} else if (process.env.DATABASE_URL && !process.env.DATABASE_URL_OWNER) {
  caution('DATABASE_URL_OWNER 가 없습니다 — 마이그레이션 시 런타임 계정을 쓰게 됩니다')
}

if (process.env.VAPID_PUBLIC_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  if (process.env.VAPID_PUBLIC_KEY !== process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    bad('VAPID_PUBLIC_KEY 와 NEXT_PUBLIC_VAPID_PUBLIC_KEY 가 다릅니다 — 브라우저 구독이 발송 시 거부됩니다')
  } else ok('VAPID 공개키 일치')
}

console.log('\n[2] 비밀값 유출')
/*
  진짜 유출만 잡는다. 오탐이 잦으면 사람은 이 점검을 무시하게 되고,
  그러면 진짜 유출이 지나간다.
   - `${...}` 는 값을 넣는 자리이지 값이 아니다 (키 생성기 출력문 등)
   - localhost / 127.0.0.1 은 로컬 도커 예시다
   - 자리표시자로 흔히 쓰는 문자열은 값이 아니다
*/
const secretPatterns = [/VAPID_PRIVATE_KEY\s*=\s*(\S+)/, /postgres(?:ql)?:\/\/[^\s"']*:([^\s"'@]+)@([^\s"'/]+)/]
const PLACEHOLDER = /^(\$\{|<|여러분|your|xxx|change|example|__)/i
function looksLikeRealSecret(match) {
  const whole = match[0]
  if (whole.includes('${')) return false
  const host = match[2]
  if (host && /^(localhost|127\.0\.0\.1|db|postgres)(:\d+)?$/.test(host)) return false
  const value = match[1] ?? ''
  if (!value || PLACEHOLDER.test(value) || value.length < 8) return false
  return true
}
const { files: tracked, source } = projectFiles()
console.log(`  (검사 대상: ${source})`)
if (tracked.length === 0) bad('검사할 파일을 찾지 못했습니다 — 이 점검은 무의미합니다')
let leaked = []
for (const f of tracked) {
  if (!existsSync(f)) continue
  if (f.endsWith('.png') || f.includes('package-lock')) continue
  let text
  try { text = readFileSync(f, 'utf-8') } catch { continue }
  for (const re of secretPatterns) {
    const m = text.match(re)
    if (!m) continue
    if (f.endsWith('.example')) continue
    if (!looksLikeRealSecret(m)) continue
    leaked.push(`${f}: ${m[0].slice(0, 44)}…`)
  }
}
if (leaked.length) { for (const l of leaked) bad(`비밀값으로 보이는 문자열: ${l}`) }
else ok('추적 중인 파일에서 비밀값 패턴을 찾지 못함')

if (existsSync('.gitignore')) {
  const gi = readFileSync('.gitignore', 'utf-8')
  if (/^\.env$/m.test(gi)) ok('.env 가 .gitignore 에 있음')
  else bad('.env 가 .gitignore 에 없습니다')
  // .env 만 막으면 vim 이 옆에 만드는 .env.swp 가 그대로 올라간다. 실제로 그렇게 유출됐다.
  if (/^\*\.swp$/m.test(gi)) ok('에디터 스왑 파일이 .gitignore 에 있음')
  else bad('*.swp 가 .gitignore 에 없습니다 — .env 를 열면 내용이 통째로 복사됩니다')
}

/*
  .gitignore 는 추적되지 않은 파일만 막는다.
  이미 추적 중이거나 `git add -f` 로 넣은 것은 그냥 통과한다 - 실제 유출은 그 경로로 났다.
  커밋을 실제로 멈추는 것은 훅뿐이므로, 훅이 설치돼 있는지를 본다.
*/
if (existsSync('.githooks/commit-msg')) ok('commit-msg 규약 검사 훅이 있음')
else caution('.githooks/commit-msg 가 없습니다 — 커밋 메시지 규약이 강제되지 않습니다')
if (existsSync('.githooks/pre-commit')) {
  let hooksPath = ''
  try { hooksPath = execFileSync('git', ['config', 'core.hooksPath'], { encoding: 'utf-8' }).trim() } catch { /* 미설정 */ }
  if (hooksPath === '.githooks') ok('pre-commit 비밀값 검사 훅이 설치됨')
  else caution('훅이 설치되지 않았습니다 - `npm install` 또는 `git config core.hooksPath .githooks`')
} else bad('.githooks/pre-commit 이 없습니다')

console.log('\n[2-1] 저장소 공개 안전성')
if (existsSync('LICENSE')) ok('LICENSE 있음')
else bad('LICENSE 가 없습니다 — public 저장소는 라이선스가 없으면 이용 조건이 불분명합니다')

// 픽스처에 실제 마켓 데이터가 들어가면 원 게시자의 글을 재배포하는 것이 된다
const REAL_DATA = /joongna\.com|karroter|ccimg\.hellomarket|yimg\.jp|media\.bunjang/
const fixtures = tracked.filter((f) => f.includes('test/fixtures/'))
const dirty = fixtures.filter((f) => { try { return REAL_DATA.test(readFileSync(f, 'utf-8')) } catch { return false } })
if (fixtures.length === 0) caution('테스트 픽스처를 찾지 못했습니다')
else if (dirty.length) for (const f of dirty) bad(`픽스처에 실제 마켓 데이터가 있습니다: ${f}`)
else ok(`테스트 픽스처 ${fixtures.length}개 전부 합성 데이터`)

console.log('\n[3] 배포 설정')
if (existsSync('apps/web/vercel.json')) {
  const v = JSON.parse(readFileSync('apps/web/vercel.json', 'utf-8'))
  if (v.installCommand?.includes('cd ../..')) ok('모노레포 설치 명령이 루트를 가리킴')
  else bad('vercel.json 의 installCommand 가 루트를 가리키지 않습니다')
  if (v.buildCommand?.includes('build:libs')) ok('빌드 전에 라이브러리를 빌드함')
  else bad('vercel.json 의 buildCommand 에 build:libs 가 없습니다')
} else bad('apps/web/vercel.json 이 없습니다')



const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))

/*
  타입 검사가 웹까지 보는지.
  `tsc -b` 는 references 에 있는 것만 본다. apps/web 은 composite 프로젝트가 아니라
  거기 못 들어가고, 그래서 오랫동안 아무도 웹의 타입을 보지 않았다 —
  없는 prop 을 넘긴 실수가 CI 를 지나 `next build` 에서야 잡힌 일이 있다.
*/
if (typeof pkg.scripts?.typecheck === 'string') {
  if (pkg.scripts.typecheck.includes('apps/web')) ok('타입 검사가 웹 앱까지 포함')
  else bad('typecheck 가 apps/web 을 검사하지 않습니다 — 웹의 타입 오류를 빌드에서야 알게 됩니다')
}
if (pkg.engines?.node) ok(`Node 버전 고정: ${pkg.engines.node}`)
else caution('package.json 에 engines.node 가 없습니다')

console.log('\n[4] 워크플로우가 쓰는 시크릿')
const needed = new Set()
for (const f of tracked.filter((f) => f.includes('.github/workflows/'))) {
  const text = readFileSync(f, 'utf-8')
  for (const m of text.matchAll(/secrets\.([A-Z_]+)/g)) needed.add(m[1])
}
if (needed.size) ok(`GitHub Secrets 에 필요: ${[...needed].join(', ')}`)
else bad('워크플로우에서 시크릿 참조를 찾지 못했습니다 — 파일 목록이 잘못됐을 수 있습니다')

const vars = new Set()
for (const f of tracked.filter((f) => f.includes('.github/workflows/'))) {
  for (const m of readFileSync(f, 'utf-8').matchAll(/vars\.([A-Z_]+)/g)) vars.add(m[1])
}
if (vars.size) ok(`GitHub Variables 에 필요: ${[...vars].join(', ')}`)

console.log(`\n${fail === 0 ? (warn === 0 ? '배포 준비 완료' : `배포 가능 (주의 ${warn}건)`) : `${fail}건 해결 필요`}`)
process.exit(fail === 0 ? 0 : 1)
