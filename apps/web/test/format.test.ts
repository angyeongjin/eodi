import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { won, wonShort, relativeTime, remainingTime, shortRegion } from '../lib/format.js'

const NOW = new Date('2026-08-29T12:00:00Z')

describe('가격 표기', () => {
  test('0원은 나눔이다', () => {
    assert.equal(won(0), '나눔')
  })
  test('세 자리 콤마', () => {
    assert.equal(won(1_250_000), '1,250,000원')
  })
  test('축약', () => {
    assert.equal(wonShort(50_000), '5만')
    assert.equal(wonShort(1_200_000), '120만')
    assert.equal(wonShort(100_000_000), '1억')
    assert.equal(wonShort(5_000), '5,000')
    assert.equal(wonShort(0), '0')
  })
})

describe('시간 표기', () => {
  test('상대 시간', () => {
    assert.equal(relativeTime(new Date('2026-08-29T11:59:30Z'), NOW), '방금')
    assert.equal(relativeTime(new Date('2026-08-29T11:30:00Z'), NOW), '30분 전')
    assert.equal(relativeTime(new Date('2026-08-29T09:00:00Z'), NOW), '3시간 전')
    assert.equal(relativeTime(new Date('2026-08-25T12:00:00Z'), NOW), '4일 전')
  })
  test('없는 값은 빈 문자열', () => {
    assert.equal(relativeTime(undefined, NOW), '')
    assert.equal(relativeTime(null, NOW), '')
  })
  test('잘못된 날짜에 NaN 을 내보내지 않는다', () => {
    assert.equal(relativeTime('그런날짜없음', NOW), '')
  })
  test('경매 남은 시간', () => {
    assert.equal(remainingTime(new Date('2026-08-31T12:00:00Z'), NOW), '2일 남음')
    assert.equal(remainingTime(new Date('2026-08-29T15:00:00Z'), NOW), '3시간 남음')
    assert.equal(remainingTime(new Date('2026-08-29T12:10:00Z'), NOW), '10분 남음')
  })
  test('지난 경매는 마감으로', () => {
    assert.equal(remainingTime(new Date('2026-08-28T12:00:00Z'), NOW), '마감')
  })
})

describe('지역 표기', () => {
  test('앞의 시·도는 군더더기라 뗀다', () => {
    assert.equal(shortRegion('서울특별시 강남구 역삼동'), '강남구 역삼동')
  })
  test('두 조각 이하는 그대로', () => {
    assert.equal(shortRegion('역삼동'), '역삼동')
    assert.equal(shortRegion(undefined), '')
  })
})
