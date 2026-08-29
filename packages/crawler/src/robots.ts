/**
 * 최소한의 robots.txt 파서.
 * "지킨다"고 문서에 쓰는 것과 코드가 실제로 막는 것은 다르다. 후자를 택한다.
 */
export interface RobotsRules {
  /** 우리 UA(또는 *)에 적용되는 Disallow 접두사 */
  disallow: string[]
  allow: string[]
  crawlDelayMs: number | null
}

const EMPTY: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null }

/** UA 토큰이 robots의 User-agent 라인과 매칭되는가 */
function uaMatches(line: string, token: string): boolean {
  const v = line.trim().toLowerCase()
  return v === '*' || token.toLowerCase().includes(v)
}

export function parseRobots(txt: string, uaToken: string): RobotsRules {
  const lines = txt.split(/\r?\n/)
  // 그룹 단위로 모은다: 연속된 User-agent 라인 뒤에 규칙들이 온다
  type Group = { agents: string[]; disallow: string[]; allow: string[]; delay: number | null }
  const groups: Group[] = []
  let cur: Group | null = null
  let expectingAgents = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()

    if (key === 'user-agent') {
      if (!expectingAgents || !cur) {
        cur = { agents: [], disallow: [], allow: [], delay: null }
        groups.push(cur)
        expectingAgents = true
      }
      cur.agents.push(val)
      continue
    }
    if (!cur) continue
    expectingAgents = false
    if (key === 'disallow') { if (val) cur.disallow.push(val); else cur.disallow.push('') }
    else if (key === 'allow') cur.allow.push(val)
    else if (key === 'crawl-delay') {
      const n = Number(val)
      if (Number.isFinite(n)) cur.delay = n * 1000
    }
  }

  // 우리 UA를 명시한 그룹이 있으면 그것만, 없으면 * 그룹
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && uaMatches(a, uaToken)))
  const wildcard = groups.filter((g) => g.agents.some((a) => a.trim() === '*'))
  const chosen = specific.length > 0 ? specific : wildcard
  if (chosen.length === 0) return EMPTY

  return {
    disallow: chosen.flatMap((g) => g.disallow).filter((d) => d !== ''),
    allow: chosen.flatMap((g) => g.allow),
    crawlDelayMs: chosen.reduce<number | null>((a, g) => (g.delay !== null ? Math.max(a ?? 0, g.delay) : a), null),
  }
}

/** robots 규칙에 따라 경로 접근이 허용되는가 (Allow 우선, 더 긴 규칙 우선) */
export function isAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  const longest = (arr: string[]) =>
    arr.filter((p) => pathWithQuery.startsWith(p)).reduce((a, b) => (b.length > a.length ? b : a), '')
  const d = longest(rules.disallow)
  const a = longest(rules.allow)
  if (!d) return true
  return a.length >= d.length
}
