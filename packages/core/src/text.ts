/**
 * 한국어 중고 매물 제목 정규화.
 * 매물 제목은 "아이폰16프로 256기가 자급제 S급 급처" 처럼
 * 띄어쓰기가 제멋대로라 compact(공백 제거) 형태를 매칭 기준으로 삼는다.
 */

/** 전각 영숫자·기호 → 반각 */
function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
}

/** 이모지·장식문자 제거 */
function stripDecorations(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, ' ')
    .replace(/[▶◀★☆■□●○◆◇▲▼※♥♡✔✅❗❕‼]/g, ' ')
}

/**
 * 한국어 수량 표기를 숫자+단위로 통일한다.
 *  "1테라" → "1tb", "512기가" → "512gb", "128 g" → "128gb"
 */
function unifyUnits(s: string): string {
  return s
    .replace(/(\d+)\s*(테라|tera)/g, '$1tb')
    .replace(/(\d+)\s*(기가|기가바이트|giga)/g, '$1gb')
    .replace(/(\d+)\s*g\b(?!hz|b)/g, '$1gb')
    .replace(/(\d+)\s*gb/g, '$1gb')
    .replace(/(\d+)\s*tb/g, '$1tb')
}

/** 표시·검색용: 소문자 + 공백 1칸 정규화 */
export function normalizeText(raw: string): string {
  return unifyUnits(stripDecorations(toHalfWidth(raw)).toLowerCase())
    .replace(/[_\-/|+~•·,.()[\]{}"'`!?:;*#@^&<>\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 매칭용: 정규화 후 모든 공백 제거 */
export function compact(raw: string): string {
  return normalizeText(raw).replace(/\s+/g, '')
}

/**
 * 정규화된 텍스트를 토큰 배열로.
 *
 * 문자 종류가 바뀌는 지점에서 쪼갠다: "아이폰16pro" → ["아이폰","16","pro"].
 * 일본어(히라가나·가타카나·한자)도 각각의 덩어리로 끊는다 —
 * 이게 없으면 "ねんどろいど 初音ミク" 가 토큰 0개가 되어 해외 검색 랭킹이 전부 0점이 된다.
 */
const TOKEN_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]+|[ぁ-ゟ]+|[ァ-ヿー]+|[一-龯]+|[a-z]+|\d+/g

export function tokenize(raw: string): string[] {
  const t = normalizeText(raw)
  if (!t) return []
  return t
    .split(' ')
    .flatMap((w) => w.match(TOKEN_RE) ?? [])
    .filter(Boolean)
}

/** "1,250,000원" / "125만원" 같은 텍스트에서 원화 금액 추출 */
export function parseKrw(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null
  const s = normalizeText(raw)
  const eok = s.match(/(\d+(?:\.\d+)?)\s*억/)
  const man = s.match(/(\d+(?:\.\d+)?)\s*만/)
  if (eok || man) {
    let v = 0
    if (eok?.[1]) v += Number(eok[1]) * 100_000_000
    if (man?.[1]) v += Number(man[1]) * 10_000
    return Math.round(v)
  }
  const digits = s.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

/** URL 안전 슬러그 (영문·숫자·하이픈) */
export function slugify(raw: string): string {
  return normalizeText(raw)
    .replace(/[^a-z0-9가-힣\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * `<script type="application/ld+json">` 안에 JSON 을 박을 때 쓰는 직렬화.
 *
 * 이 JSON 에는 매물 제목 같은 **남이 쓴 문자열**이 들어간다.
 * JSON.stringify 는 `<` 를 escape 하지 않으므로, 제목에 `</script>` 가 있으면
 * 스크립트 블록이 그대로 닫히고 그 뒤가 HTML 로 해석된다.
 */
export function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
