import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { interleaveByTerm } from '../lib/feed.js'

/*
  피드가 "내가 찾던 것들"이라고 말하려면 여러 키워드가 실제로 섞여야 한다.
  한 키워드가 열두 칸을 다 먹으면 그건 피드가 아니라 그냥 검색 결과다.
*/

const key = (s: string) => s

describe('피드 배치', () => {
  test('키워드마다 한 건씩 번갈아 담는다', () => {
    const picked = interleaveByTerm([['a1', 'a2', 'a3'], ['b1', 'b2', 'b3']], 6, key)
    assert.deepEqual(picked, ['a1', 'b1', 'a2', 'b2', 'a3', 'b3'])
  })

  test('한쪽이 모자라면 나머지가 채운다 — 빈칸을 남기지 않는다', () => {
    const picked = interleaveByTerm([['a1'], ['b1', 'b2', 'b3']], 4, key)
    assert.deepEqual(picked, ['a1', 'b1', 'b2', 'b3'])
  })

  test('총량을 넘기지 않는다', () => {
    const picked = interleaveByTerm([['a1', 'a2'], ['b1', 'b2']], 3, key)
    assert.equal(picked.length, 3)
  })

  test('같은 매물이 두 키워드에 걸려도 한 번만 나온다', () => {
    const picked = interleaveByTerm([['x', 'a2'], ['x', 'b2']], 4, key)
    assert.deepEqual(picked, ['x', 'a2', 'b2'])
  })

  test('빈 입력에도 터지지 않는다', () => {
    assert.deepEqual(interleaveByTerm([], 12, key), [])
    assert.deepEqual(interleaveByTerm([[], []], 12, key), [])
    assert.deepEqual(interleaveByTerm([['a']], 0, key), [])
  })
})
