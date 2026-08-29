/**
 * 환경변수 읽기.
 *
 * `process.env.X ?? 기본값` 은 함정이다. `??` 는 null/undefined 에만 반응하는데,
 * `.env` 파일에 `X=` 라고 비워두면 **빈 문자열**이 들어와 기본값이 무시된다.
 *
 * 실제로 이것 때문에 이런 일이 벌어질 뻔했다.
 *   SOURCE_TIMEOUT_MS=  →  Number('') === 0  →  모든 소스가 즉시 타임아웃
 *   EODI_UA=            →  ''               →  우리가 자기를 밝히지 않고 남의 서버를 부름
 *
 * `.env` 템플릿은 원래 키를 비워둔 채 배포되므로, 빈 값은 "설정 안 함"으로 취급해야 한다.
 */

/** 비어 있거나 공백뿐이면 설정하지 않은 것으로 본다 */
export function envStr(name: string, fallback: string): string {
  const v = process.env[name]
  if (v === undefined) return fallback
  const t = v.trim()
  return t === '' ? fallback : t
}

/** 값이 없어도 되는 경우 */
export function envOptional(name: string): string | undefined {
  const v = process.env[name]
  const t = v?.trim()
  return t ? t : undefined
}

/** 숫자로 못 읽히는 값도 기본값으로 떨어뜨린다 */
export function envNum(name: string, fallback: number): number {
  const t = envOptional(name)
  if (t === undefined) return fallback
  const n = Number(t)
  return Number.isFinite(n) ? n : fallback
}

/** '1' / 'true' / 'yes' 를 참으로 본다 */
export function envBool(name: string, fallback = false): boolean {
  const t = envOptional(name)?.toLowerCase()
  if (t === undefined) return fallback
  return t === '1' || t === 'true' || t === 'yes' || t === 'on'
}

/** 쉼표로 나뉜 목록. 빈 항목은 버린다 */
export function envList(name: string): string[] {
  return (envOptional(name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
