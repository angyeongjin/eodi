/**
 * 오타 교정.
 *
 * 굿즈 이름은 외래어 음차라 표기가 흔들린다 — 주술회전/주슬회전, 넨도로이드/넨도로이도.
 * 사전에 없으면 지금은 0건을 주고 끝난다. 사람은 자기가 틀렸는지 사전에 없는지 모른다.
 *
 * 재료는 이미 있다. 굿즈 사전 표제어 900개가 곧 "이 도메인에서 옳은 철자" 목록이다.
 */
import { GOODS_TERMS, type GoodsTerm } from './goods.js'
import { normalizeText } from './text.js'

const BASE = 0xac00
const LAST = 0xd7a3
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'

/**
 * 음절을 자모로 푼다.
 *
 * 한국어 오타는 음절이 아니라 자모에서 난다. "주슬회전"은 음절로 보면 한 글자가 통째로
 * 다르지만 자모로 보면 ㅡ/ㅜ 하나 차이다. 음절 기준으로 재면 두 글자짜리 말이
 * 아무거나와 한 글자 차이가 되어 엉뚱한 제안이 쏟아진다.
 */
export function toJamo(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= BASE && code <= LAST) {
      const i = code - BASE
      out += CHO[Math.floor(i / 588)]!
      out += JUNG[Math.floor((i % 588) / 28)]!
      const jong = JONG[i % 28]!
      if (jong !== ' ') out += jong
    } else out += ch
  }
  return out
}

/** 두 문자열의 편집거리. 상한을 넘으면 즉시 포기한다 — 900개를 다 재야 하므로 */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > cap) return cap + 1
    prev = cur
  }
  return prev[b.length]!
}

/*
  두벌식 자판. IME 를 안 바꾸고 친 영문을 한글로 되돌린다.
  "wntnfghlwjs" 를 0건으로 돌려보내는 건 서비스가 게으른 것이다.
*/
const QWERTY: Record<string, string> = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
}
/** 모음 두 개가 겹쳐 하나가 되는 조합 */
const COMPOUND_JUNG: Record<string, string> = {
  'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ',
}
/** 받침 두 개가 겹쳐 하나가 되는 조합 */
const COMPOUND_JONG: Record<string, string> = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ',
  'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ',
}

/**
 * 영문 자판으로 친 한글을 되돌린다. 한글이 아닌 글자가 섞이면 그대로 둔다.
 * 조합 규칙은 두벌식 오토마타를 그대로 따른다 — 절반만 맞으면 없느니만 못하다.
 */
export function fromQwerty(input: string): string {
  const jamo = [...input].map((c) => QWERTY[c] ?? c)
  let out = ''
  let cho = -1, jung = -1, jong = -1

  const flush = () => {
    if (cho >= 0 && jung >= 0) {
      out += String.fromCodePoint(BASE + cho * 588 + jung * 28 + (jong < 0 ? 0 : jong))
    } else if (cho >= 0) out += CHO[cho]!
    else if (jung >= 0) out += JUNG[jung]!
    cho = jung = jong = -1
  }

  for (const j of jamo) {
    const ci = CHO.indexOf(j)
    const vi = JUNG.indexOf(j)

    if (vi >= 0) {
      if (jung >= 0 && jong < 0) {
        // 모음이 이어지면 겹모음일 수 있다
        const merged = COMPOUND_JUNG[JUNG[jung]! + j]
        if (merged) { jung = JUNG.indexOf(merged); continue }
      }
      if (jong >= 0) {
        // 받침이 다음 글자의 초성으로 넘어간다: 한글 조합의 핵심 규칙
        const jongCh = JONG[jong]!
        const pair = Object.entries(COMPOUND_JONG).find(([, v]) => v === jongCh)
        if (pair) {
          jong = JONG.indexOf(pair[0][0]!)
          flushWithCarry(pair[0][1]!, vi)
        } else {
          const carry = jongCh
          jong = -1
          flushWithCarry(carry, vi)
        }
        continue
      }
      if (jung >= 0) { flush() }
      if (cho < 0) { out += j; continue }
      jung = vi
      continue
    }

    if (ci >= 0 || JONG.indexOf(j) > 0) {
      if (cho < 0) { flush(); cho = ci; continue }
      if (jung < 0) { flush(); cho = ci; continue }
      if (jong < 0) {
        const ji = JONG.indexOf(j)
        if (ji > 0) { jong = ji; continue }
        flush(); cho = ci; continue
      }
      const merged = COMPOUND_JONG[JONG[jong]! + j]
      if (merged) { jong = JONG.indexOf(merged); continue }
      flush(); cho = ci
      continue
    }

    flush()
    out += j
  }
  flush()
  return out

  function flushWithCarry(carryCho: string, vi: number) {
    flush()
    cho = CHO.indexOf(carryCho)
    jung = vi
  }
}

/** 사전 표제어 하나하나를 자모로 미리 풀어 둔다 */
const JAMO_INDEX: Array<{ ko: string; jamo: string; term: GoodsTerm }> = GOODS_TERMS.flatMap((term) =>
  term.ko.map((ko) => ({ ko, jamo: toJamo(ko), term })),
)
const KNOWN = new Set(JAMO_INDEX.map((e) => e.ko))

export interface Correction {
  /** 고쳐 쓴 검색어 전체 */
  suggestion: string
  /** 왜 고쳤는지 — 화면에서 문구를 가른다 */
  reason: 'keyboard' | 'spelling'
}

/**
 * 검색어를 고쳐 제안한다. 고칠 게 없으면 null.
 *
 * 아는 말은 건드리지 않는다. 맞게 친 사람에게 "혹시 이거?"를 들이미는 것이
 * 틀린 사람을 놓치는 것보다 나쁘다.
 */
export function suggestCorrection(rawQuery: string): Correction | null {
  const q = normalizeText(rawQuery).trim()
  if (!q || q.length > 40) return null

  // 1) 자판을 안 바꾸고 친 경우. 되돌렸을 때 사전에 있으면 확실하다.
  if (/^[A-Za-z\s]+$/.test(q)) {
    const back = fromQwerty(q).trim()
    if (back !== q && [...back].some((c) => c >= '가' && c <= '힣')) {
      const words = back.split(/\s+/).filter(Boolean)
      if (words.some((w) => KNOWN.has(w))) return { suggestion: back, reason: 'keyboard' }
    }
    return null
  }

  // 2) 철자. 토큰 단위로 보고, 이미 아는 말은 그대로 둔다.
  const words = q.split(/\s+/).filter(Boolean)
  let changed = false
  const fixed = words.map((w) => {
    if (KNOWN.has(w) || !/[가-힣]/.test(w)) return w
    const wj = toJamo(w)
    // 짧은 말에 거리 2를 허용하면 아무거나 걸린다. 길이에 비례해 연다.
    const cap = wj.length <= 6 ? 1 : wj.length <= 12 ? 2 : 3
    let best: { ko: string; d: number } | null = null
    for (const e of JAMO_INDEX) {
      const d = editDistance(wj, e.jamo, cap)
      if (d > cap) continue
      if (!best || d < best.d || (d === best.d && e.ko.length < best.ko.length)) best = { ko: e.ko, d }
      if (d === 0) break
    }
    if (!best) return w
    changed = true
    return best.ko
  })

  if (!changed) return null
  const suggestion = fixed.join(' ')
  return suggestion === q ? null : { suggestion, reason: 'spelling' }
}
