import { compact } from './text.js'

/**
 * 매물 주의 신호.
 *
 * 굿즈·피규어 시장에서 구매자가 실제로 겁내는 것은 가격이 아니라 **가품**이다.
 * 특히 일본 매물은 제목이 일본어라 한국 사용자가 "海賊版"(해적판) 같은 표기를 놓친다.
 *
 * 원칙 두 가지:
 *  1. **감추지 않고 라벨링한다.** 개조품·동인 굿즈를 일부러 찾는 사람도 있다.
 *  2. **경고만 붙이고 보증은 하지 않는다.** "정품"은 판매자의 주장일 뿐 우리가 검증한 사실이 아니다.
 *     긍정 배지를 달면 우리가 보증하는 것처럼 읽힌다. 그래서 주의 신호만 단다.
 */
export type ListingWarning =
  | 'replica'   // 가품·해적판 표기
  | 'modified'  // 개조·리페인팅·자작
  | 'unofficial'// 비공식·동인
  | 'preorder'  // 예약·수주생산 (아직 물건이 없다)
  | 'damaged'   // 흠·결품
  | 'junk'      // 정크·작동 미확인

export const WARNING_LABEL: Record<ListingWarning, string> = {
  replica: '가품 표기',
  modified: '개조·자작',
  unofficial: '비공식·동인',
  preorder: '예약 상품',
  damaged: '흠·결품',
  junk: '정크·미확인',
}

export const WARNING_DESC: Record<ListingWarning, string> = {
  replica: '판매자가 정품이 아니라고 밝혔거나 그렇게 읽히는 표기가 있습니다.',
  modified: '개조·재도색·자작품입니다. 공장 출고 상태가 아닙니다.',
  unofficial: '공식 라이선스 상품이 아닙니다(동인·비공식 굿즈).',
  preorder: '아직 발매되지 않은 예약 상품입니다. 바로 받을 수 없습니다.',
  damaged: '흠집이나 부속 누락이 있다고 표기되어 있습니다.',
  junk: '정크 취급 매물입니다. 작동·상태를 보증하지 않습니다.',
}

/** 한국어·일본어를 함께 본다. 일본 매물은 한국 사용자가 표기를 놓치기 쉽다. */
const DICT: Record<ListingWarning, readonly string[]> = {
  replica: [
    '레플리카', '짝퉁', '가품', '이미테이션', '비정품', '무허가', '중국판', '카피품',
    '海賊版', 'レプリカ', '模造品', 'コピー品', '非正規品', '無版権', '中華製', 'パチ物',
  ],
  modified: [
    '개조', '리페인팅', '재도색', '자작', '핸드메이드',
    // '塗装済み' 는 넣지 않는다. "ノンスケール ABS 塗装済み完成品" 은
    // 공장 도색 완성품이라는 뜻으로, 스케일 피규어 상품 설명에 거의 항상 붙는 정상 표기다.
    '改造', 'リペイント', '自作', 'ハンドメイド', 'ガレージキット', 'カスタム',
  ],
  unofficial: ['비공식', '동인굿즈', '동인지', '非公式', '同人', 'ファンメイド'],
  preorder: ['예약판매', '예약상품', '사전예약', '予約', '受注生産', '発売前', '入荷予定'],
  damaged: [
    '흠집있', '파손있', '결품', '부속누락', '상자없',
    '難あり', '傷あり', '訳あり', '欠品', '破損', '箱なし', '汚れ',
  ],
  junk: ['정크', '작동미확인', 'ジャンク', '動作未確認', '現状渡し', 'ノークレーム'],
}

/** 한 글자 키워드는 반드시 오탐을 만든다 (분류 사전에서 이미 겪었다) */
for (const [name, words] of Object.entries(DICT)) {
  for (const w of words) {
    if (w.length < 2) throw new Error(`주의 신호 사전 ${name} 에 한 글자 키워드: "${w}"`)
  }
}

/**
 * 제목에서 주의 신호를 뽑는다.
 *
 * compact() 는 공백을 지우므로 "海賊 版" 같은 띄어쓰기도 잡힌다.
 * 우선순위는 없다 — 여러 개면 여러 개 다 붙인다.
 */
export function detectWarnings(rawTitle: string): ListingWarning[] {
  const c = compact(rawTitle)
  if (!c) return []
  const out: ListingWarning[] = []
  for (const [kind, words] of Object.entries(DICT) as Array<[ListingWarning, readonly string[]]>) {
    if (words.some((w) => c.includes(compact(w)))) out.push(kind)
  }
  return out
}

/** 랭킹 감점. 감추지는 않되 위로 올리지도 않는다. */
export const WARNING_PENALTY: Record<ListingWarning, number> = {
  replica: 0.45,
  modified: 0.85,
  unofficial: 0.9,
  preorder: 0.8,
  damaged: 0.8,
  junk: 0.7,
}

export function warningPenalty(warnings: readonly ListingWarning[]): number {
  return warnings.reduce((acc, w) => acc * WARNING_PENALTY[w], 1)
}

export const WARNING_DICT = DICT
