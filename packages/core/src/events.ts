import { SOURCE_LABEL, type SourceId, type MarketScope } from './types.js'

/**
 * 화면에서 일어난 일 중 우리가 세는 것.
 *
 * 지금은 하나뿐이다 — **원본 마켓으로 나간 클릭**. 검색이 몇 번 일어났는지는 `query_log` 가 이미 알고,
 * 그 둘을 나누면 "찾아준 것이 실제로 쓸모 있었는가"가 나온다.
 * 랭킹을 고칠 유일한 근거이고, 마켓·구매대행 제휴를 제안할 때 내밀 유일한 숫자다.
 *
 * **사람은 세지 않는다.** 세션 ID·IP·UA 를 만들지도 저장하지도 않으므로 같은 사람이 두 번 눌렀는지
 * 우리는 알 수 없다. 그래서 이 수치는 "순 사용자"가 아니라 "행동 횟수"다. 정확도를 조금 잃는 대신
 * 계정도 개인정보도 갖지 않는다는 약속이 유지된다. 그 교환이 유리하다고 판단했다.
 */
export const EVENT_KINDS = ['outbound'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export interface EventInput {
  kind: EventKind
  scope: MarketScope
  /** 어느 마켓으로 나갔는지 */
  source: SourceId | null
  /** 결과 목록에서 몇 번째였는지(0-based). 랭킹이 위쪽을 맞히고 있는지 본다 */
  position: number | null
  /** 정규화된 검색어. 사용자가 친 원문이 아니라 정규화형만 남긴다 */
  normalized: string | null
}

const MAX_TERM_LEN = 120
const MAX_POSITION = 999

/**
 * 브라우저가 보낸 값은 전부 의심한다.
 *
 * 던지지 않고 `null` 을 돌려준다 — 계측이 실패해도 사용자의 클릭은 원본으로 가야 한다.
 * 모르는 값은 필드만 비우고 넘어가되, **무엇을 셌는지 알 수 없는 이벤트는 통째로 버린다.**
 * 반쯤 맞는 통계는 없는 통계보다 나쁘다. 그걸 근거로 랭킹을 고치게 되기 때문이다.
 */
export function parseEvent(raw: unknown): EventInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>

  const kind = o.kind
  if (typeof kind !== 'string') return null
  if (!(EVENT_KINDS as readonly string[]).includes(kind)) return null

  const scope: MarketScope = o.scope === 'overseas' ? 'overseas' : 'domestic'

  const source =
    typeof o.source === 'string' && Object.prototype.hasOwnProperty.call(SOURCE_LABEL, o.source)
      ? (o.source as SourceId)
      : null

  const position =
    typeof o.position === 'number' &&
    Number.isInteger(o.position) &&
    o.position >= 0 &&
    o.position <= MAX_POSITION
      ? o.position
      : null

  let normalized: string | null = null
  if (typeof o.normalized === 'string') {
    const trimmed = o.normalized.trim().slice(0, MAX_TERM_LEN)
    if (trimmed) normalized = trimmed
  }

  // 어느 마켓으로 나갔는지 모르는 아웃바운드 클릭은 셀 이유가 없다.
  // 소스별 비중이 이 이벤트의 존재 이유이기 때문이다.
  if (kind === 'outbound' && source === null) return null

  return { kind: kind as EventKind, scope, source, position, normalized }
}
