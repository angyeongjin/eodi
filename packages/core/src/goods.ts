import { GOODS_TERMS } from './goods.data.js'
import { normalizeText } from './text.js'
import { isChoseongQuery, matchesChoseong } from './hangul.js'

/**
 * 한→일 굿즈 사전과 질의 번역.
 *
 * 일본 마켓은 한글 검색어에 0건을 준다. 크롤링을 아무리 잘해도
 * "피규어"를 "フィギュア"로 바꿔주지 못하면 한국 사용자에게는 쓸모가 없다.
 */

export type GoodsKind = 'category' | 'ip' | 'character' | 'brand' | 'condition' | 'slang'

export interface GoodsTerm {
  kind: GoodsKind
  /** 한글 표기 변형 (줄임말 포함) */
  ko: string[]
  /** 일본에서 실제로 쓰는 검색어 */
  ja: string
  /** 대체 일본어 표기 */
  jaAlt?: string[]
  /** 캐릭터라면 소속 작품의 한글 표제어. 연관검색어의 재료다 */
  ip?: string
}

export const GOODS_KIND_LABEL: Record<GoodsKind, string> = {
  category: '종류',
  ip: '작품',
  character: '캐릭터',
  brand: '브랜드',
  condition: '상태',
  // 상품명이 아니라 사람들끼리 부르는 말. "간바레 데쿠"(히로아카 이치방쿠지 C상)처럼
  // 커뮤니티에서만 통하는 이름이 실제 매물 제목에 그대로 쓰인다.
  slang: '커뮤니티 용어',
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
/*
  한국어는 붙여 쓰고 조사가 붙는다. "주술회전피규어" 는 띄어쓰기가 없고
  "주술회전의" 는 조사가 붙는다. 그렇다고 아무 데서나 부분 문자열로 찾으면
  "수건걸이"의 수건, "명조체"의 명조, "니케이"의 니케가 굿즈로 잡힌다.
  사전이 커질수록 이런 오탐이 같이 커진다 — 실제로 900 표제어에서 16건 나왔다.

  그래서 토큰 하나를 사전 표제어로 **남김없이 덮을 수 있을 때만** 인정한다.
  "주술회전피규어" 는 주술회전+피규어로 완전히 덮이고,
  "수건걸이" 는 "걸이" 가 남아 탈락한다.
*/
const PARTICLE = new Set([
  '의', '은', '는', '이', '가', '을', '를', '에', '에서', '으로', '로',
  '도', '만', '과', '와', '랑', '이랑', '님', '요',
])

interface Segment { ko?: string; term?: GoodsTerm; keep?: string }

/** 토큰을 사전 표제어(+비한글 조각)로 완전히 분해한다. 못 하면 null */
function segmentToken(token: string): Segment[] | null {
  const memo = new Map<number, Segment[] | null>()

  const walk = (i: number, lastKoLen: number): Segment[] | null => {
    if (i >= token.length) return []
    const cached = memo.get(i)
    if (cached !== undefined && lastKoLen >= 3) return cached

    for (const { ko, term } of INDEX) {
      if (!token.startsWith(ko, i)) continue
      const tail = walk(i + ko.length, ko.length)
      if (tail) {
        const out = [{ ko, term }, ...tail]
        if (lastKoLen >= 3) memo.set(i, out)
        return out
      }
    }

    // 비한글 조각(숫자·영문·일본어)은 그대로 살려 보낸다
    const nonHangul = /^[^가-힣]+/.exec(token.slice(i))
    if (nonHangul) {
      const tail = walk(i + nonHangul[0].length, 0)
      if (tail) return [{ keep: nonHangul[0] }, ...tail]
    }

    /*
      조사만 남았으면 덮은 것으로 친다. 단 바로 앞 표제어가 세 글자 이상일 때만이다.
      두 글자에 조사를 허용하면 "몰리는"의 몰리, "니케이"의 니케가 다시 살아난다.
    */
    if (lastKoLen >= 3 && PARTICLE.has(token.slice(i))) return []

    if (lastKoLen >= 3) memo.set(i, null)
    return null
  }

  return walk(0, 0)
}

export function translateToJapanese(rawQuery: string): Translation {
  const q = normalizeText(rawQuery)
  if (!q) return { ja: null, hits: [], unresolved: [], passthrough: false }

  // 한글이 없으면 이미 일본어·영문·숫자다. 그대로 보낸다.
  if (!HANGUL.test(q)) return { ja: q, hits: [], unresolved: [], passthrough: true }

  const hits: TranslationHit[] = []
  const out: string[] = []
  const unresolved: string[] = []

  for (const token of q.split(/\s+/).filter(Boolean)) {
    const segs = segmentToken(token)
    if (!segs) {
      // 못 덮은 토큰. 한글이면 사전 보강 대상이고, 아니면 그대로 살려 보낸다.
      if (HANGUL.test(token)) unresolved.push(token)
      else out.push(token)
      continue
    }
    for (const seg of segs) {
      if (seg.term && seg.ko) {
        hits.push({ ko: seg.ko, ja: seg.term.ja, kind: seg.term.kind })
        out.push(seg.term.ja)
      } else if (seg.keep) out.push(seg.keep)
    }
  }

  if (hits.length === 0) return { ja: null, hits: [], unresolved, passthrough: false }

  /*
    "수건 세트" 는 세트만 맞고 수건은 모른다. 이걸 번역 성공으로 치면
    일본 마켓에 セット 만 던지게 된다 — 아무 의미 없는 검색이다.
    무엇을 찾는지(작품·캐릭터·브랜드)를 하나도 모른 채 수식어만 맞았고
    못 옮긴 말이 남았다면, 모른다고 답하는 편이 낫다. 그래야 사전 보강 대상으로도 남는다.
  */
  const onlyModifiers = hits.every((h) => h.kind === 'condition' || h.kind === 'category')
  if (onlyModifiers && unresolved.length > 0) {
    return { ja: null, hits: [], unresolved, passthrough: false }
  }

  const ja = [...new Set(out)].join(' ').trim()
  return { ja: ja || null, hits, unresolved, passthrough: false }
}

/*
  연관검색어.

  굿즈 검색은 0건이 잦다 — 재고가 유동적이라 어제 있던 물건이 오늘 없다.
  그때 빈 화면을 주면 사람은 그냥 나간다. 같은 작품의 다른 캐릭터를 권하면
  적어도 한 번 더 볼 이유가 생긴다.

  반대 방향도 쓸모가 있다. 작품 이름만 아는 사람이 많다 —
  "주술회전" 을 치면 고죠·이타도리를 보여줘야 최애를 고를 수 있다.
*/
const BY_IP = new Map<string, GoodsTerm[]>()
for (const t of GOODS_TERMS) {
  if (t.kind !== 'character' || !t.ip) continue
  const list = BY_IP.get(t.ip)
  if (list) list.push(t)
  else BY_IP.set(t.ip, [t])
}
const IP_TERM = new Map<string, GoodsTerm>()
for (const t of GOODS_TERMS) if (t.kind === 'ip') for (const k of t.ko) IP_TERM.set(k, t)

/** 굿즈 검색에서 실제로 많이 붙는 종류. 작품만 알고 뭘 살지 모르는 사람에게 준다 */
const STAPLE_KO = ['피규어', '아크릴스탠드', '이치방쿠지', '넨도로이드', '캔뱃지']
const STAPLE = STAPLE_KO.map((ko) => GOODS_TERMS.find((t) => t.ko[0] === ko)).filter(
  (t): t is GoodsTerm => Boolean(t),
)

export interface GoodsWork {
  /** 대표 한글 표기 */
  ko: string
  /** 일본 마켓에 보낼 말 */
  ja: string
  /** 사전이 아는 이 작품의 캐릭터 */
  characters: GoodsTerm[]
}

/**
 * 캐릭터를 가진 작품 목록.
 *
 * 지금 이 서비스는 검색창에 뭘 칠지 아는 사람만 쓸 수 있다.
 * 작품 단위 지면을 만들려면 "어떤 작품을 아는지"가 먼저 있어야 한다.
 * 캐릭터가 없는 작품은 보여줄 것이 없으므로 뺀다.
 */
export function goodsWorks(): GoodsWork[] {
  const out: GoodsWork[] = []
  for (const [ipKo, chars] of BY_IP) {
    const work = IP_TERM.get(ipKo)
    if (!work || chars.length === 0) continue
    out.push({ ko: work.ko[0]!, ja: work.ja, characters: chars })
  }
  return out.sort((a, b) => b.characters.length - a.characters.length || a.ko.localeCompare(b.ko))
}

/** 한글 표기로 작품 하나를 찾는다. 표제어 변형(줄임말)도 받는다 */
export function findGoodsWork(ko: string): GoodsWork | null {
  const term = IP_TERM.get(normalizeText(ko))
  if (!term) return null
  const chars = BY_IP.get(term.ko[0]!) ?? []
  return { ko: term.ko[0]!, ja: term.ja, characters: chars }
}

export interface RelatedTerms {
  /** 같은 작품의 다른 캐릭터 */
  siblings: GoodsTerm[]
  /** 캐릭터가 속한 작품 */
  work: GoodsTerm | null
  /** 작품·캐릭터에 흔히 붙는 굿즈 종류 */
  staples: GoodsTerm[]
}

/**
 * 검색어와 이어지는 말들을 찾는다.
 *
 * 검색 로그가 아니라 사전의 관계에서 뽑는다. 로그 기반("이걸 본 사람은 이것도")은
 * 트래픽이 쌓여야 의미가 있는데, 지금 로그는 대부분 예열과 개발자 테스트다.
 * 지어낸 추천을 주느니 사전이 아는 관계만 보여준다.
 */
export function relatedTerms(query: string, limit = 8): RelatedTerms {
  const { hits } = translateToJapanese(query)
  const empty: RelatedTerms = { siblings: [], work: null, staples: [] }
  if (hits.length === 0) return empty

  // 무엇을 찾는지 정하는 것은 캐릭터와 작품뿐이다. 수식어는 실마리가 되지 않는다.
  const character = hits.find((h) => h.kind === 'character')
  const ipHit = hits.find((h) => h.kind === 'ip')

  let ipKo: string | null = null
  if (character) {
    const term = GOODS_TERMS.find((t) => t.kind === 'character' && t.ko.includes(character.ko))
    ipKo = term?.ip ?? null
  } else if (ipHit) {
    ipKo = IP_TERM.get(ipHit.ko)?.ko[0] ?? null
  }
  if (!ipKo) return { ...empty, staples: STAPLE }

  const siblings = (BY_IP.get(ipKo) ?? [])
    .filter((t) => !character || !t.ko.includes(character.ko))
    .slice(0, limit)

  return { siblings, work: IP_TERM.get(ipKo) ?? null, staples: STAPLE }
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
