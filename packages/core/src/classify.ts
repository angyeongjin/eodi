import type { CategoryId, ListingKind } from './types.js'
import { compact } from './text.js'

/** 판매글이 아님 — 매입/구매 희망 */
const WANTED = [
  '매입', '삽니다', '삽니당', '사요', '사고싶', '구매합니다', '구매희망', '구합니다', '구해요',
  '구입합니다', '수거합니다', '매입해요', '팔실분', '파실분', '매입전문', '중고매입', '고가매입',
  '삽니다요', '구매원합니다', '삽니다연락',
]

/** 상품이 아님 — 서비스/광고 */
const SERVICE = [
  '대여', '렌탈', '렌트', '임대해', '수리전문', '출장수리', '액정교체',
  '통신사가입', '개통대행', '요금제', '보험가입', '소액결제', '현금화', '폰테크', '내구제',
  '급전대출', '판매대행', '광고문의', '제휴문의', '수강생', '원데이클래스',
]

/** 본품이 아님 — 부품·불량 */
const PARTS = [
  '부품용', '부품취급', '파손폰', '파손품', '고장폰', '고장난', '침수폰', '침수품', '액정파손',
  '액정깨짐', '액정만', '메인보드', '기판', '분해품', '잠금폰', '아이클라우드잠김', '통신사잠김',
  '유심기변불가', '분실폰', '배터리만', '뒷판', '후면유리', '수리용', '부품',
]

/** 액세서리 */
const ACCESSORY = [
  '케이스', '필름', '강화유리', '보호필름', '거치대', '충전기', '충전케이블', '케이블', '어댑터',
  '이어팁', '파우치', '그립톡', '스트랩', '범퍼', '젤리', '스킨', '보호커버', '카메라보호',
  '렌즈보호', '크래들', '삼각대', '짐벌', '스탠드', '펜슬팁', '키스킨', '전용백',
  '충전독', '도킹독', '홀더', '실리콘커버', '폰커버', '커버케이스', '키보드커버',
  '그립캡', '스틱커버', '조이콘커버',
  '보호캡', '악세사리', '악세서리', '액세서리', '주변기기', '키캡', '마우스패드',
]

/** 액세서리 단어가 있어도 본품 판매인 경우의 단서 */
const BUNDLED_HINT = [
  '포함', '증정', '사은품', '드려요', '드립니다', '같이', '함께', '추가로', '서비스로',
  '풀박', '풀구성', '구성품', '기본구성', '무료증정', '덤으로',
]

/**
 * 콘텐츠(게임 타이틀·소프트웨어).
 * 게임기를 찾는 사람에게 게임 칩은 다른 물건이다. 감추지는 않고 따로 라벨링한다.
 */
const MEDIA = [
  '게임팩', '게임칩', '카트리지', '게임소프트', '게임시디', '게임씨디', '다운로드코드',
  '소프트웨어', '타이틀', '게임타이틀', '디스크판', '패키지판', 'dlc',
  // 게임 타이틀 매물 제목에 자주 붙는 표기들
  '한글판', '정발판', '북미판', '일판', '초회한정', '초한정판', '합본팩', '스위치게임',
  '한글자막', '스팀코드', '기프트카드',
]

/** 게임기 카테고리에서 "게임" 이 붙으면 대개 타이틀이다. 단 본체 구성품 표기가 있으면 예외. */
const MEDIA_HINT = ['게임', '타이틀', '칩']
const CONSOLE_BODY_HINT = ['본체', '풀박스', '풀구성', '게임기', '독세트', '조이콘', '한글판본체']

/** 다량/도매 */
const BULK = ['대량판매', '대량구매', '도매', '벌크', '여러대', '재고정리', '박스단위', '떨이']

/** 미개봉/새제품 */
const SEALED = ['미개봉', '새제품', '미사용', '언박싱만', '풀박스미개봉', '신품']

/**
 * 사전 안전장치.
 * 한 글자짜리 키워드는 반드시 오탐을 만든다 — '삼' 하나가 "삼성" 전체를 매입글로 만든 적이 있다.
 * 사전이 로드되는 순간 터지게 해서 같은 실수를 두 번 하지 않는다.
 */
function assertSafeDict(name: string, words: readonly string[]): void {
  for (const w of words) {
    if (w.length < 2) throw new Error(`분류 사전 ${name} 에 한 글자 키워드가 있습니다: "${w}"`)
  }
}

function hasAny(hay: string, needles: readonly string[]): string | null {
  for (const n of needles) if (hay.includes(n)) return n
  return null
}

export interface KindVerdict {
  kind: ListingKind
  /** 판정 근거 키워드 */
  hit: string | null
}

export interface ClassifyContext {
  /** 매칭된 표준 제품의 카테고리. 게임 타이틀 판별에 쓴다 */
  category?: CategoryId
}

/**
 * 제목을 보고 글의 종류를 라벨링한다.
 * 우선순위: 매입 > 서비스 > 부품 > 대량 > 콘텐츠 > 액세서리 > 본품
 * (한 글에 여러 신호가 섞이면 "판매글이 아닌 쪽"을 먼저 잡아야 결과가 깨끗하다)
 */
export function classifyKind(rawTitle: string, ctx: ClassifyContext = {}): KindVerdict {
  const c = compact(rawTitle)
  if (!c) return { kind: 'item', hit: null }

  let hit = hasAny(c, WANTED)
  if (hit) return { kind: 'wanted', hit }

  hit = hasAny(c, SERVICE)
  if (hit) return { kind: 'service', hit }

  hit = hasAny(c, PARTS)
  if (hit) return { kind: 'parts', hit }

  hit = hasAny(c, BULK)
  if (hit) return { kind: 'bulk', hit }

  const bodyHint = hasAny(c, CONSOLE_BODY_HINT)
  hit = hasAny(c, MEDIA)
  if (hit && !bodyHint) return { kind: 'media', hit }
  if (ctx.category === 'console' && !bodyHint) {
    hit = hasAny(c, MEDIA_HINT)
    if (hit) return { kind: 'media', hit }
  }

  hit = hasAny(c, ACCESSORY)
  if (hit && !hasAny(c, BUNDLED_HINT)) return { kind: 'accessory', hit }

  return { kind: 'item', hit: null }
}

export function looksSealed(rawTitle: string): boolean {
  return hasAny(compact(rawTitle), SEALED) !== null
}

export const KIND_DICT = { WANTED, SERVICE, PARTS, ACCESSORY, MEDIA, BULK, SEALED, BUNDLED_HINT }

for (const [name, words] of Object.entries(KIND_DICT)) assertSafeDict(name, words)
