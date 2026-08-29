import { GOODS_TERMS } from './goods.data.js'
import { normalizeText } from './text.js'
import { isChoseongQuery, matchesChoseong } from './hangul.js'

/**
 * 한→일 굿즈 사전과 질의 번역.
 *
 * 일본 마켓은 한글 검색어에 0건을 준다. 크롤링을 아무리 잘해도
 * "피규어"를 "フィギュア"로 바꿔주지 못하면 한국 사용자에게는 쓸모가 없다.
 */

export type GoodsKind = 'category' | 'ip' | 'character' | 'brand' | 'condition'

export interface GoodsTerm {
  kind: GoodsKind
  /** 한글 표기 변형 (줄임말 포함) */
  ko: string[]
  /** 일본에서 실제로 쓰는 검색어 */
  ja: string
  /** 대체 일본어 표기 */
  jaAlt?: string[]
}

export const GOODS_KIND_LABEL: Record<GoodsKind, string> = {
  category: '종류',
  ip: '작품',
  character: '캐릭터',
  brand: '브랜드',
  condition: '상태',
}

export { GOODS_TERMS }

/** 긴 표제어부터 매칭해야 "아크릴스탠드"가 "아크릴"로 잘리지 않는다 */
const INDEX: Array<{ ko: string; term: GoodsTerm }> = GOODS_TERMS.flatMap((term) =>
  term.ko.map((ko) => ({ ko, term })),
).sort((a, b) => b.ko.length - a.ko.length)

const HANGUL = /[가-힣]/
const HANGUL_RUN = /[가-힣]{2,}/g

export interface TranslationHit {
  ko: string
  ja: string
  kind: GoodsKind
}

export interface Translation {
  /** 일본 마켓에 보낼 검색어. 번역이 불가능하면 null */
  ja: string | null
  hits: TranslationHit[]
  /** 사전에 없어서 못 옮긴 한글 조각 — 사전 보강 대상 */
  unresolved: string[]
  /** 원문에 한글이 없어 번역이 필요 없었는지 */
  passthrough: boolean
}

/**
 * 한글 질의를 일본어로 옮긴다.
 *
 * 완벽한 번역기를 만들려는 게 아니다. 굿즈 도메인의 고유명사만 정확히 바꾸면 된다.
 * 사전에 없는 말은 지어내지 않고 `unresolved` 로 돌려준다 — 엉뚱한 결과를 주느니
 * "이 단어는 아직 모른다"고 말하는 편이 낫다.
 */
export function translateToJapanese(rawQuery: string): Translation {
  const q = normalizeText(rawQuery)
  if (!q) return { ja: null, hits: [], unresolved: [], passthrough: false }

  // 한글이 없으면 이미 일본어·영문·숫자다. 그대로 보낸다.
  if (!HANGUL.test(q)) return { ja: q, hits: [], unresolved: [], passthrough: true }

  const hits: TranslationHit[] = []
  // 매칭된 구간을 지워가며 진행한다. 지운 자리는 공백으로 바꿔 인접어가 붙지 않게 한다.
  let rest = q.replace(/\s+/g, ' ')

  for (const { ko, term } of INDEX) {
    if (!rest.includes(ko)) continue
    hits.push({ ko, ja: term.ja, kind: term.kind })
    rest = rest.split(ko).join(' ')
  }

  // 남은 한글 덩어리는 못 옮긴 것
  const unresolved = [...new Set(rest.match(HANGUL_RUN) ?? [])]
  // 한글이 아닌 잔여물(숫자·영문·일본어)은 그대로 검색어에 살려 보낸다
  const keep = rest
    .replace(HANGUL_RUN, ' ')
    .replace(/[가-힣]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)

  if (hits.length === 0) {
    return { ja: null, hits: [], unresolved, passthrough: false }
  }

  // 사전 순서가 아니라 원문 등장 순서를 따라야 자연스러운 검색어가 된다
  hits.sort((a, b) => q.indexOf(a.ko) - q.indexOf(b.ko))

  const ja = [...new Set([...hits.map((h) => h.ja), ...keep])].join(' ').trim()
  return { ja: ja || null, hits, unresolved, passthrough: false }
}

/**
 * 굿즈 사전 자동완성.
 *
 * 세 가지를 함께 본다 — 앞글자 일치, 부분 일치, **초성 일치**.
 * 순서는 그대로 우선순위다. "ㅈㅅㅎㅈ" 로 주술회전이 나와야 한다.
 */
export function suggestGoodsTerms(prefix: string, limit = 8): GoodsTerm[] {
  const raw = prefix.trim()
  if (!raw) return []
  const q = normalizeText(raw)
  const choseong = isChoseongQuery(raw)

  const scored: Array<{ term: GoodsTerm; ko: string; rank: number }> = []
  for (const { ko, term } of INDEX) {
    let rank = -1
    if (choseong) {
      if (matchesChoseong(raw, ko)) rank = 1
    } else if (ko.startsWith(q)) rank = 0
    else if (ko.includes(q)) rank = 2
    if (rank < 0) continue
    scored.push({ term, ko, rank })
  }

  scored.sort((a, b) => a.rank - b.rank || a.ko.length - b.ko.length)

  const out: GoodsTerm[] = []
  for (const { term } of scored) {
    if (out.length >= limit) break
    if (out.some((t) => t.ja === term.ja)) continue
    out.push(term)
  }
  return out
}

/** 사전 항목의 대표 한글 표기 */
export function goodsLabel(term: GoodsTerm): string {
  return term.ko[0] ?? term.ja
}
