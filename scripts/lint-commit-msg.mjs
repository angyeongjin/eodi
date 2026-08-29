/**
 * 커밋 메시지 검사.
 *
 * 규약이 문서에만 있으면 지켜지지 않는다.
 * ways-of-working.md 에 커밋 프리픽스 규칙이 있었지만 커밋 4개가 전부 어겼고,
 * 아무도 몰랐다. 그래서 여기서 막는다.
 *
 * 규칙은 이 파일이 유일한 근거다. 문서는 비공개 저장소에 있어 여기서 참조하지 않는다.
 */
import { readFileSync } from 'node:fs'

const TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'build', 'ci', 'chore', 'revert']
const SCOPES = ['core', 'crawler', 'db', 'web', 'infra', 'docs', 'deps']
const MAX_TITLE = 72
const MAX_BODY_LINE = 100

/*
  한글은 터미널에서 두 칸을 먹는다. .length 로 세면 42자짜리 제목이
  실제로는 64칸이라 `git log --oneline` 에서 줄이 넘어간다.
  글자 수가 아니라 보이는 폭으로 잰다.
*/
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/
const width = (s) => [...s].reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0)

const path = process.argv[2]
if (!path) { console.error('커밋 메시지 파일 경로가 없습니다'); process.exit(1) }

const raw = readFileSync(path, 'utf-8')
// 주석과 diff 는 메시지가 아니다
const lines = raw.split('\n').filter((l) => !l.startsWith('#'))

// merge/revert/fixup 은 git 이 만들어 주는 형식이라 우리 규칙을 적용하지 않는다
if (/^(Merge |Revert |fixup!|squash!)/.test(lines[0] ?? '')) process.exit(0)

const title = (lines[0] ?? '').trim()
const problems = []

if (!title) problems.push('제목이 비어 있습니다')

const HEADER = new RegExp(`^(${TYPES.join('|')})(\\(([a-z-]+)\\))?: (.+)$`)
const m = title.match(HEADER)

if (title && !m) {
  problems.push(
    `제목 형식이 맞지 않습니다: "${title.slice(0, 50)}"\n` +
    `      형식  <타입>(<범위>): <무엇을 했는지>\n` +
    `      타입  ${TYPES.join(', ')}\n` +
    `      범위  ${SCOPES.join(', ')} (전역이면 생략)`,
  )
} else if (m) {
  const [, , , scope, subject] = m
  if (scope && !SCOPES.includes(scope)) {
    problems.push(`범위 "${scope}" 는 없습니다. 가능: ${SCOPES.join(', ')}`)
  }
  const tw = width(title)
  if (tw > MAX_TITLE) {
    problems.push(`제목이 ${tw}칸입니다. ${MAX_TITLE}칸을 넘기지 않습니다 — 요약이 덜 된 것입니다 (한글 1자 = 2칸)`)
  }
  if (subject.endsWith('.')) problems.push('제목 끝에 마침표를 찍지 않습니다')
  /*
    제목은 문장이 아니라 작업 이름표다. "~연다", "~막는다" 처럼 서술형으로 끝내면
    길어지고 말투가 제각각이 된다. 명사형으로 끊는다 — 추가/변경/제거/수정/방지.
  */
  if (/다$/.test(subject.trim())) {
    problems.push(`제목을 서술형으로 끝내지 않습니다: "…${subject.trim().slice(-12)}" → 명사형으로 (추가/변경/제거/수정)`)
  }
  // 제목에 연결어미가 들어가면 관심사가 두 개라는 신호다
  const conj = subject.match(/([가-힣]{1,4}(?:고|며)),/)
  if (conj) problems.push(`제목에 "${conj[1]}," 가 있습니다 — 관심사가 둘이면 커밋을 나누세요`)
  if (subject.trim().length < 5) problems.push('제목이 너무 짧아 무엇을 했는지 알 수 없습니다')
  // "수정", "개선" 만 있는 제목은 diff 를 열어야만 알 수 있다
  if (/^(수정|개선|업데이트|변경|반영|적용|작업|정리)$/.test(subject.trim())) {
    problems.push(`"${subject.trim()}" 만으로는 무엇을 했는지 알 수 없습니다`)
  }
}

// 제목 다음은 반드시 빈 줄. 이게 없으면 git 이 본문을 제목의 연장으로 다룬다
if (lines.length > 1 && lines[1].trim() !== '') {
  problems.push('제목과 본문 사이에 빈 줄이 있어야 합니다')
}

/*
  본문은 불릿만 받는다.
  서술형 문단은 쓰는 사람마다 길이가 제각각이고, 읽는 사람은 결국 안 읽는다.
  실제로 본문 20줄짜리 커밋이 쌓여 다시 쓴 적이 있다.
*/
const bodyLines = lines.slice(2).filter((l) => l.trim() !== '')
const trailer = /^(Co-Authored-By|Claude-Session|Signed-off-by|Refs?|Closes?|Fixes?):/i
const bullets = bodyLines.filter((l) => !trailer.test(l.trim()))
const prose = bullets.filter((l) => !/^\s*[-*]\s+\S/.test(l))
if (prose.length) {
  problems.push(
    `본문은 불릿(- )만 씁니다. 서술형 ${prose.length}줄:\n` +
    prose.slice(0, 3).map((l) => `        "${l.trim().slice(0, 46)}…"`).join('\n'),
  )
}
if (bullets.length > 6) {
  problems.push(`불릿이 ${bullets.length}개입니다. 6개를 넘으면 커밋을 나누세요`)
}

const longBody = lines.slice(2)
  .map((l, i) => [i + 3, l])
  .filter(([, l]) => width(l) > MAX_BODY_LINE && !/^(Co-Authored-By|Claude-Session|https?:)/.test(l.trim()))
if (longBody.length) {
  problems.push(`본문 ${longBody.map(([n]) => n + '행').join(', ')} 이 ${MAX_BODY_LINE}칸을 넘습니다`)
}

if (problems.length) {
  const red = '\x1b[31m', dim = '\x1b[2m', off = '\x1b[0m'
  console.error(`\n${red}커밋 메시지가 규약에 맞지 않습니다.${off}\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error(`\n${dim}  제목  <타입>(<범위>): <무엇을 했는지>  — 명사형으로 끝내고 72칸 이내`)
  console.error(`  본문  불릿(- )만, 6개 이하`)
  console.error(`  예시  feat(web): 색상 필터 추가${off}\n`)
  process.exit(1)
}
