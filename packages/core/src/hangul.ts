/**
 * 한글 초성 처리.
 *
 * 한국 사용자는 긴 이름을 초성으로 친다 — "ㄱㅁㅇㅋㄴ" 로 귀멸의 칼날을 찾는다.
 * 굿즈 이름은 대개 길어서(`장송의프리렌`, `카드캡터체리`) 이 편의가 특히 크게 먹힌다.
 */

const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

const BASE = 0xac00
const LAST = 0xd7a3

/** 겹자음을 홑자음으로 — 사용자는 ㄱ 을 치지 ㄲ 을 치지 않는 경우가 많다 */
const LOOSE: Record<string, string> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' }

/** "귀멸의칼날" → "ㄱㅁㅇㅋㄴ" (한글이 아닌 글자는 그대로 둔다) */
export function toChoseong(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= BASE && code <= LAST) {
      out += CHO[Math.floor((code - BASE) / 588)] ?? ''
    } else if (ch !== ' ') {
      out += ch
    }
  }
  return out
}

/** 겹자음 차이를 없앤 비교용 형태 */
export function looseChoseong(text: string): string {
  return [...toChoseong(text)].map((c) => LOOSE[c] ?? c).join('')
}

/** 입력이 초성만으로 이루어져 있는가 (ㄱㅁ, ㅈㅅㅎㅈ …) */
export function isChoseongQuery(q: string): boolean {
  const t = q.replace(/\s+/g, '')
  if (t.length < 2) return false
  return [...t].every((c) => (CHO as readonly string[]).includes(c))
}

/**
 * 초성 질의가 대상 문자열에 맞는가.
 *
 * 앞에서부터 맞는 것만 인정한다. 중간 일치까지 허용하면
 * "ㄱㅁ" 이 거의 모든 이름에 걸려 자동완성이 쓸모없어진다.
 */
export function matchesChoseong(query: string, target: string): boolean {
  const q = looseChoseong(query.replace(/\s+/g, ''))
  if (!q) return false
  return looseChoseong(target).startsWith(q)
}
