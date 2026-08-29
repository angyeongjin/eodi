/**
 * 스테이징된 내용만 검사한다.
 *
 * .gitignore 는 "아직 추적되지 않은 파일"만 막는다.
 * 한번 추적되기 시작한 파일, `git add -f` 로 강제로 넣은 파일은 그대로 통과한다.
 * 실제로 .env.swp 가 그렇게 공개 저장소까지 갔다(2026-08-29).
 * 그래서 이 검사는 이름이 아니라 "커밋에 들어가려는 바이트"를 본다.
 */
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
  .split('\n').map((s) => s.trim()).filter(Boolean)

if (staged.length === 0) process.exit(0)

/** 이름만으로 이미 탈락인 것들. 내용을 볼 필요도 없다. */
const FORBIDDEN_NAME = [
  { re: /(^|\/)\.env(\..+)?$/, why: '환경변수 파일' },
  { re: /\.(swp|swo|swn)$/, why: '에디터 스왑 파일 — 원본 내용이 통째로 들어 있다' },
  { re: /(^|\/)\..+\.sw[a-p]$/, why: '에디터 스왑 파일' },
  { re: /\.(pem|key|p12|pfx)$/, why: '개인키·인증서' },
  { re: /(^|\/)id_(rsa|ed25519)/, why: 'SSH 개인키' },
  { re: /(^|\/)\.jira-token$/, why: 'API 토큰' },
]
const NAME_ALLOW = /(^|\/)\.env\.example$/

/** 내용에서 찾는 것들. preflight 와 같은 패턴을 쓴다 — 두 곳이 다르면 한 곳은 거짓말이 된다. */
const CONTENT = [
  { re: /VAPID_PRIVATE_KEY\s*=\s*(\S+)/, why: 'VAPID 개인키' },
  { re: /postgres(?:ql)?:\/\/[^\s"']*:([^\s"'@]+)@([^\s"'/]+)/, why: 'DB 접속 문자열(비밀번호 포함)' },
  { re: /\bnpg_[A-Za-z0-9]{12,}/, why: 'Neon 비밀번호' },
  { re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/, why: 'GitHub 토큰' },
  { re: /\bsk-[A-Za-z0-9-]{20,}/, why: 'API 키' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS 액세스 키' },
]
const PLACEHOLDER = /^(\$\{|<|여러분|your|xxx|change|example|__)/i

function realSecret(m) {
  if (m[0].includes('${')) return false
  const host = m[2]
  if (host && /^(localhost|127\.0\.0\.1|db|postgres)(:\d+)?$/.test(host)) return false
  const v = m[1] ?? m[0]
  return Boolean(v) && !PLACEHOLDER.test(v) && v.length >= 8
}

const problems = []

for (const f of staged) {
  if (!NAME_ALLOW.test(f)) {
    const hit = FORBIDDEN_NAME.find((n) => n.re.test(f))
    if (hit) { problems.push(`${f} — ${hit.why}`); continue }
  }
  if (f.endsWith('.example') || f.includes('package-lock') || /\.(png|jpe?g|gif|webp|ico|woff2?)$/.test(f)) continue

  let blob
  // 스테이징된 버전을 읽는다. 작업트리 파일이 아니다 — 둘은 다를 수 있다.
  try { blob = git('show', `:${f}`) } catch { continue }
  if (blob.includes('\0')) continue // 바이너리

  for (const c of CONTENT) {
    const m = blob.match(c.re)
    if (m && realSecret(m)) problems.push(`${f} — ${c.why}: ${m[0].slice(0, 40)}…`)
  }
}

if (problems.length) {
  const red = '\x1b[31m', off = '\x1b[0m'
  console.error(`\n${red}커밋을 멈췄습니다. 스테이징된 내용에 비밀값이 있습니다.${off}\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error('\n  git restore --staged <파일>  로 빼고 다시 커밋하세요.')
  console.error('  이미 추적 중인 파일이라면 git rm --cached <파일> 로 추적을 끊으세요.')
  console.error('  정말 의도한 것이라면 git commit --no-verify (권장하지 않습니다).\n')
  process.exit(1)
}
