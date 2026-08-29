import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isCacheFresh, isCacheUsable, DEFAULT_TTL_MS, STALE_MS } from '../src/cache.js'

/*
  캐시를 "버릴 때"와 "낡았지만 쓸 때"를 가르는 판정이다.
  잘못 잡으면 팔린 매물을 오래 보여주거나(느슨), 아무도 캐시를 못 쓴다(빡빡).
*/

describe('캐시 신선도', () => {
  test('방금 만든 캐시는 신선하다', () => {
    assert.equal(isCacheFresh(new Date()), true)
  })

  test('TTL 을 넘기면 신선하지 않다 — 그래도 버리는 것과는 다르다', () => {
    const justOver = new Date(Date.now() - DEFAULT_TTL_MS - 1_000)
    assert.equal(isCacheFresh(justOver), false)
  })

  test('TTL 을 인자로 바꿔 판정할 수 있다', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    assert.equal(isCacheFresh(fiveMinAgo, 10 * 60 * 1000), true)
    assert.equal(isCacheFresh(fiveMinAgo, 1 * 60 * 1000), false)
  })

  test('낡은 캐시를 쓰는 창은 신선 기한보다 길다', () => {
    // 이 관계가 뒤집히면 stale-while-revalidate 가 성립하지 않는다
    assert.ok(STALE_MS > 0)
    assert.ok(DEFAULT_TTL_MS + STALE_MS > DEFAULT_TTL_MS)
  })

  test('신선하지 않아도 상한 안이면 답으로 쓸 수 있다', () => {
    const stale = new Date(Date.now() - DEFAULT_TTL_MS - 1_000)
    assert.equal(isCacheFresh(stale), false)
    assert.equal(isCacheUsable(stale), true)
  })

  test('상한을 넘기면 쓰지 않는다 — "낡아도 쓴다"가 "얼마나 낡았든 쓴다"가 되면 안 된다', () => {
    const tooOld = new Date(Date.now() - DEFAULT_TTL_MS - STALE_MS - 1_000)
    assert.equal(isCacheUsable(tooOld), false)
  })
})
