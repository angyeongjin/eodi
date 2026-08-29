/**
 * 일본 매물의 "예상 최종 지출".
 *
 * 표시가는 지불액이 아니다. 일본에서 직배송이 안 되므로 구매대행 수수료·국제배송비가 붙고,
 * 금액이 커지면 관세와 부가세도 붙는다. 이걸 말하지 않고 ¥3,247 만 보여주면
 * "일본이 훨씬 싸다"는 착각을 주게 되고, 그건 우리가 하지 않기로 한 거짓말이다.
 *
 * **정확한 값은 낼 수 없다.** 대행사마다 수수료가 다르고, 국제배송비는 무게에 달렸는데
 * 우리는 무게를 모르며, 관세율은 품목별로 갈린다. 그래서 하나의 숫자가 아니라 **범위**를 주고,
 * 무엇을 가정했는지 함께 보여준다. 모르는 것을 아는 척하느니 폭을 넓게 잡는 편이 낫다.
 */

/** 구매대행 수수료율. 업계 통상 5~10% (docs/02-business/business-model.md) */
export const AGENT_FEE_RATE = { low: 0.05, high: 0.1 } as const
/** 대행사 대부분이 최소 수수료를 둔다 */
export const AGENT_FEE_MIN_KRW = 3_000

/**
 * 국제배송비. 소형 굿즈(1kg 이하) 항공 기준 대략값이다.
 * 무게를 모르는 상태의 추정이므로 폭을 넓게 잡는다.
 */
export const INTL_SHIPPING_KRW = { low: 15_000, high: 30_000 } as const

/**
 * 관세·부가세.
 *
 * 자가사용 특송 물품은 물품가격이 미화 150달러 이하면 면세로 통관되는 것이 통상이다.
 * 환율이 계속 움직이므로 원화 환산 한도는 여유를 두고 잡는다.
 * 초과분에는 관세(완구·피규어 기준 8%)와 부가세 10%가 붙는다.
 * 품목이 바뀌면 관세율도 바뀌므로 이 값은 "대표값"이지 확정값이 아니다.
 */
export const DUTY_FREE_LIMIT_KRW = 200_000
export const DUTY_RATE = 0.08
export const VAT_RATE = 0.1

export interface LandedCostInput {
  /** 상품 표시가를 원화로 환산한 값 */
  priceKrw: number
  /** 일본 내 배송비(원화 환산). 없으면 0 */
  domesticShippingKrw?: number
}

export interface CostLine {
  label: string
  low: number
  high: number
  /** 이 줄이 왜 범위인지 */
  note?: string
}

export interface LandedCostEstimate {
  low: number
  high: number
  lines: CostLine[]
  /** 관세·부가세 구간에 들어갔는지 (면세 추정이면 false) */
  taxed: boolean
  assumptions: string[]
}

function round100(n: number): number {
  return Math.round(n / 100) * 100
}

function tax(base: number): number {
  if (base <= DUTY_FREE_LIMIT_KRW) return 0
  const duty = base * DUTY_RATE
  return duty + (base + duty) * VAT_RATE
}

/**
 * 예상 지출 범위. 값은 100원 단위로 뭉갠다 — 1원 단위까지 쓰면 정확한 계산처럼 읽힌다.
 */
export function estimateLandedCost(input: LandedCostInput): LandedCostEstimate | null {
  const price = Math.max(0, Math.round(input.priceKrw))
  const domestic = Math.max(0, Math.round(input.domesticShippingKrw ?? 0))
  // 나눔·0원 매물에 지출을 추정해 붙이는 것은 의미가 없다
  if (price <= 0) return null

  const feeLow = Math.max(AGENT_FEE_MIN_KRW, price * AGENT_FEE_RATE.low)
  const feeHigh = Math.max(AGENT_FEE_MIN_KRW, price * AGENT_FEE_RATE.high)

  // 과세가격은 물품가에 운임을 더해 잡는 것이 통상이라, 범위의 양 끝에서 각각 계산한다
  const taxBaseLow = price + domestic + INTL_SHIPPING_KRW.low
  const taxBaseHigh = price + domestic + INTL_SHIPPING_KRW.high
  const taxLow = tax(taxBaseLow)
  const taxHigh = tax(taxBaseHigh)

  const lines: CostLine[] = [
    { label: '상품가', low: price, high: price },
  ]
  if (domestic > 0) {
    lines.push({ label: '일본 내 배송', low: domestic, high: domestic })
  }
  lines.push({
    label: '구매대행 수수료',
    low: round100(feeLow),
    high: round100(feeHigh),
    note: '상품가의 5~10%, 대행사마다 다릅니다',
  })
  lines.push({
    label: '국제배송',
    low: INTL_SHIPPING_KRW.low,
    high: INTL_SHIPPING_KRW.high,
    note: '무게를 알 수 없어 소형 굿즈 기준으로 잡았습니다',
  })
  if (taxHigh > 0) {
    lines.push({
      label: '관세·부가세',
      low: round100(taxLow),
      high: round100(taxHigh),
      note: '15만원(미화 150달러) 이하는 보통 면세입니다. 관세율은 품목마다 다릅니다',
    })
  }

  const assumptions = [
    '구매대행 수수료 5~10%',
    '국제배송 소형 굿즈 1kg 이하 기준',
    taxHigh > 0 ? '관세 8%(완구·피규어 기준) + 부가세 10%' : '면세 한도 안으로 추정',
  ]

  return {
    low: round100(price + domestic + feeLow + INTL_SHIPPING_KRW.low + taxLow),
    high: round100(price + domestic + feeHigh + INTL_SHIPPING_KRW.high + taxHigh),
    lines,
    taxed: taxHigh > 0,
    assumptions,
  }
}

/** "4.2만~5.8만원" — 카드 한 줄에 들어갈 짧은 표기 */
export function formatCostRange(low: number, high: number): string {
  const short = (n: number): string => {
    if (n >= 10_000) {
      const man = n / 10_000
      return `${man >= 10 ? Math.round(man) : Math.round(man * 10) / 10}만`
    }
    return `${Math.round(n / 1_000)}천`
  }
  return `${short(low)}~${short(high)}원`
}
