import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { search } from '../src/service.js'
import { popularQueries, topUntranslated } from '@eodi/db'

/*
  DATABASE_URL 없이 돈다. @eodi/db 는 DB 가 없으면 인메모리로 떨어지므로
  "기록했는가"를 프로세스 안에서 그대로 확인할 수 있다.
*/

describe('해외 검색: 번역 실패 시에도 신호를 남긴다', () => {
  /*
    한 단어도 옮기지 못한 검색은 결과가 0건이다. 그런데 바로 그 말이
    굿즈 사전에 가장 먼저 넣어야 할 말이다.

    예전에는 번역 실패 시 곧바로 빈 결과를 돌려주면서 기록 단계를 통째로 건너뛰었다.
    부분 번역된 검색어만 쌓이고, 정작 하나도 모르는 말은 흔적 없이 사라졌다.
    사전을 키우는 유일한 신호가 가장 필요한 순간에만 끊겨 있었던 셈이다.
  */
  test('전혀 옮기지 못한 검색어가 미번역 목록에 쌓인다', async () => {
    const term = '테스트용없는말꾸러미'
    const res = await search(
      { q: term, scope: 'overseas', sort: 'relevance', page: 1, perPage: 24, filters: {} },
    )

    assert.equal(res.total, 0, '옮기지 못했으면 결과는 0건이어야 한다')
    assert.equal(res.interpreted.overseasTerm, null, '지어낸 일본어를 보내지 않는다')
    assert.deepEqual(res.interpreted.untranslated, [term], '무엇을 몰랐는지 응답에 담는다')

    const pending = await topUntranslated(100)
    assert.ok(
      pending.some((u) => u.term === term),
      '번역 실패한 말은 사전 보강 후보로 기록되어야 한다',
    )
  })

  test('번역 실패한 검색도 수요 신호로 남는다', async () => {
    const term = '테스트용없는말둘'
    await search(
      { q: term, scope: 'overseas', sort: 'relevance', page: 1, perPage: 24, filters: {} },
    )

    const popular = await popularQueries(100)
    assert.ok(
      popular.some((p) => p.term === term),
      '0건이어도 사람이 찾았다는 사실은 남아야 예열·사전 우선순위를 정할 수 있다',
    )
  })

  test('persist:false 면 아무것도 남기지 않는다', async () => {
    const term = '테스트용없는말셋'
    await search(
      { q: term, scope: 'overseas', sort: 'relevance', page: 1, perPage: 24, filters: {} },
      { persist: false },
    )

    const pending = await topUntranslated(100)
    assert.ok(!pending.some((u) => u.term === term), 'persist:false 는 기록하지 않는다')
  })
})
