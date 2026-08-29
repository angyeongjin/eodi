/**
 * 서버 렌더 페이지에 박혀 있는 구조화 데이터를 꺼내는 도구들.
 *
 * 마켓들은 검색 결과를 검색엔진이 읽을 수 있도록 HTML 안에 JSON 으로 심어둔다.
 * 그 JSON 을 정확히 잘라내는 것이 파싱의 전부다 — 정규식으로 통째로 긁으면
 * 제목 안의 대괄호나 따옴표에서 반드시 깨진다.
 */

/**
 * `"key":[ ... ]` 형태의 JSON 배열을 대괄호 균형을 세어 잘라낸다.
 * 문자열 안의 `[`, `]`, 이스케이프된 따옴표를 올바르게 건너뛴다.
 */
export function extractJsonArray(text: string, key: string): string | null {
  /*
    `"key":[` 를 그대로 찾으면 상대가 직렬화기를 바꿔 `"key": [` 로만 나와도 조용히 0건이 된다.
    실제 페이로드는 대개 압축되어 있지만, 그 가정에 파서를 걸어둘 이유가 없다.
  */
  const marker = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*\\[`)
  const m = marker.exec(text)
  if (!m) return null
  const at = m.index
  const start = at + m[0].length - 1
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Next.js App Router 의 RSC 스트림을 복원한다.
 *
 * 페이지는 `self.__next_f.push([1,"<JSON 문자열 리터럴>"])` 를 여러 번 호출하고,
 * 그 조각들을 이어붙여야 원래 페이로드가 된다.
 * 조각 하나만 보고 파싱하면 데이터가 중간에서 잘린다.
 */
export function readNextFlightPayload(html: string): string {
  const parts: string[] = []
  const PUSH = 'self.__next_f.push([1,'
  let cursor = 0

  while (true) {
    const at = html.indexOf(PUSH, cursor)
    if (at < 0) break
    const quote = html.indexOf('"', at + PUSH.length)
    if (quote < 0) break

    // 문자열 리터럴의 끝을 이스케이프를 존중하며 찾는다
    let end = quote + 1
    while (end < html.length) {
      const ch = html[end]!
      if (ch === '\\') { end += 2; continue }
      if (ch === '"') break
      end++
    }
    if (end >= html.length) break

    try {
      parts.push(JSON.parse(html.slice(quote, end + 1)) as string)
    } catch {
      // 조각 하나가 깨져도 나머지는 살린다
    }
    cursor = end + 1
  }

  return parts.join('')
}

/**
 * Next.js Pages Router 가 심는 `<script id="__NEXT_DATA__">` 의 JSON 을 읽는다.
 * App Router 의 RSC 스트림(readNextFlightPayload)과 달리 한 덩어리로 들어 있다.
 */
export function readNextDataJson<T = unknown>(html: string): T | null {
  const open = html.indexOf('id="__NEXT_DATA__"')
  if (open < 0) return null
  const start = html.indexOf('>', open)
  if (start < 0) return null
  const end = html.indexOf('</script>', start)
  if (end < 0) return null
  try {
    return JSON.parse(html.slice(start + 1, end)) as T
  } catch {
    return null
  }
}
