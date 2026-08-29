/**
 * 브랜드 보이스 검사.
 *
 * 보이스 가이드를 문서로만 두면 반드시 어긋난다 — 급할 때 쓰는 문구가 원칙을 어긴다.
 * 그래서 사전 안전장치(assertSafeDict)와 같은 방식으로, **빌드를 세우는 규칙**으로 만든다.
 *
 * 검사 대상은 "화면에 나가는 문자열"뿐이다. 주석·문서·변수명은 건드리지 않는다.
 *
 *   node scripts/brand-lint.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TARGET_DIRS = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages/core/src']
const SKIP = new Set(['node_modules', '.next', 'dist'])

/** 규칙: [패턴, 왜 안 되는지, 대신 이렇게] */
const RULES = [
  [/최저\s*가|가장\s*싼|제일\s*싼/, '우리는 전 마켓을 다 보지 않는다. 알 수 없는 것을 단언하는 말', '“6개 마켓에서 모아 보여드립니다”'],
  [/정품\s*(보장|인증)|진품\s*보장/, '우리는 진위를 검증하지 않는다', '“판매자가 가품이라고 표기한 매물입니다”'],
  [/100\s*%\s*(보장|정품|확실)|무조건|절대\s*안전/, '지킬 수 없는 약속', '조건을 그대로 쓴다'],
  [/완벽(한|하게)/, '지킬 수 없는 약속', '무엇을 어디까지 하는지 구체적으로'],
  [/잘못된\s*(요청|검색|입력)|올바르지\s*않/, '사용자를 탓하는 말', '“요청을 이해하지 못했습니다”'],
]

/** 사용자에게 보이는 문자열만 뽑는다 — 주석과 코드 식별자는 제외 */
function userFacingStrings(src) {
  // 블록/라인 주석 제거
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const out = []
  // 따옴표 문자열 + JSX 텍스트 노드
  for (const m of noComments.matchAll(/'([^'\\\n]{2,200})'|"([^"\\\n]{2,200})"|`([^`\\]{2,300})`/g)) {
    const v = m[1] ?? m[2] ?? m[3] ?? ''
    if (/[가-힣]/.test(v)) out.push(v)
  }
  for (const m of noComments.matchAll(/>([^<>{}]*[가-힣][^<>{}]*)</g)) {
    out.push(m[1].trim())
  }
  return out
}

function walk(dir, acc = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return acc }
  for (const name of entries) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx)$/.test(full)) acc.push(full)
  }
  return acc
}

const files = TARGET_DIRS.flatMap((d) => walk(d))
if (files.length === 0) {
  console.error('검사할 파일을 찾지 못했습니다 — 이 검사는 무의미합니다.')
  process.exit(1)
}

let violations = 0
let checked = 0
for (const f of files) {
  const src = readFileSync(f, 'utf-8')
  const strings = userFacingStrings(src)
  checked += strings.length
  for (const s of strings) {
    for (const [re, why, better] of RULES) {
      if (!re.test(s)) continue
      violations++
      console.log(`\n❌ ${f}`)
      console.log(`   "${s.trim().slice(0, 80)}"`)
      console.log(`   ${why}`)
      console.log(`   → ${better}`)
    }
  }
}

console.log(
  `\n파일 ${files.length}개 · 사용자 문자열 ${checked}개 검사` +
    (violations === 0 ? '\n브랜드 보이스 위반 없음' : `\n위반 ${violations}건 — 브랜드 보이스 문서(비공개 저장소) 참고`),
)
process.exit(violations === 0 ? 0 : 1)
