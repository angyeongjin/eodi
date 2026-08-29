import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  estimateLandedCost, formatCostRange,
  DUTY_FREE_LIMIT_KRW, AGENT_FEE_MIN_KRW, INTL_SHIPPING_KRW,
} from '../src/landed-cost.js'

/*
  이 숫자는 사용자가 "살까 말까"를 정하는 데 쓴다. 틀리면 안 되는 게 아니라
  **틀릴 수 있다는 사실이 드러나야** 한다. 그래서 하나의 값이 아니라 범위를 검증한다.
*/

describe('예상 지출 — 범위의 성질', () => {
  test('낮은 쪽이 항상 높은 쪽보다 작거나 같다', () => {
    for (const price of [1_000, 30_000, 200_000, 1_000_000]) {
      const e = estimateLandedCost({ priceKrw: price })
      assert.ok(e, '추정이 나와야 한다')
      assert.ok(e.low <= e.high, `${price}원에서 범위가 뒤집혔다`)
    }
  })

  test('표시가보다 항상 크다 — 그게 이 계산의 존재 이유다', () => {
    const e = estimateLandedCost({ priceKrw: 30_000 })!
    assert.ok(e.low > 30_000)
  })

  test('비쌀수록 총액도 커진다', () => {
    const cheap = estimateLandedCost({ priceKrw: 20_000 })!
    const pricey = estimateLandedCost({ priceKrw: 90_000 })!
    assert.ok(pricey.low > cheap.low && pricey.high > cheap.high)
  })

  test('일본 내 배송비가 있으면 그만큼 늘고 내역에 남는다', () => {
    const without = estimateLandedCost({ priceKrw: 30_000 })!
    const with_ = estimateLandedCost({ priceKrw: 30_000, domesticShippingKrw: 8_000 })!
    assert.ok(with_.low > without.low)
    assert.ok(with_.lines.some((l) => l.label === '일본 내 배송'))
    assert.ok(!without.lines.some((l) => l.label === '일본 내 배송'))
  })

  test('0원·나눔 매물은 추정하지 않는다', () => {
    assert.equal(estimateLandedCost({ priceKrw: 0 }), null)
    assert.equal(estimateLandedCost({ priceKrw: -100 }), null)
  })
})

describe('예상 지출 — 관세 구간', () => {
  test('면세 한도 아래면 관세 줄이 없다', () => {
    const e = estimateLandedCost({ priceKrw: 30_000 })!
    assert.equal(e.taxed, false)
    assert.ok(!e.lines.some((l) => l.label === '관세·부가세'))
    assert.ok(e.assumptions.some((a) => a.includes('면세')))
  })

  test('한도를 확실히 넘으면 관세·부가세가 붙는다', () => {
    const e = estimateLandedCost({ priceKrw: DUTY_FREE_LIMIT_KRW + 100_000 })!
    assert.equal(e.taxed, true)
    const line = e.lines.find((l) => l.label === '관세·부가세')
    assert.ok(line && line.high > 0)
  })

  test('한도 근처에서는 낮은 쪽만 면세일 수 있다 — 국제배송비가 과세가격에 들어가기 때문', () => {
    // 상품가 + 낮은 배송비는 한도 아래, + 높은 배송비는 한도 위가 되는 지점
    const price = DUTY_FREE_LIMIT_KRW - INTL_SHIPPING_KRW.low - 1_000
    const e = estimateLandedCost({ priceKrw: price })!
    const line = e.lines.find((l) => l.label === '관세·부가세')
    assert.ok(line, '높은 쪽이 과세면 줄이 보여야 한다')
    assert.equal(line!.low, 0, '낮은 쪽은 면세다')
    assert.ok(line!.high > 0)
  })
})

describe('예상 지출 — 수수료 하한', () => {
  test('아주 싼 매물도 최소 수수료가 든다', () => {
    const e = estimateLandedCost({ priceKrw: 3_000 })!
    const fee = e.lines.find((l) => l.label === '구매대행 수수료')!
    assert.equal(fee.low, AGENT_FEE_MIN_KRW)
  })
})

describe('짧은 표기', () => {
  test('만원 단위로 뭉갠다', () => {
    assert.equal(formatCostRange(42_000, 58_000), '4.2만~5.8만원')
    assert.equal(formatCostRange(120_000, 250_000), '12만~25만원')
  })

  test('만원 미만은 천원 단위로', () => {
    assert.equal(formatCostRange(3_000, 9_000), '3천~9천원')
  })
})
