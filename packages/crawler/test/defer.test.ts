import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { search } from '../src/service.js'
import { popularQueries } from '@eodi/db'

/*
  네트워크를 쓰지 않는다 — federate 에 어댑터를 빈 배열로 주입해 소스 호출 자체를 없앤다.
  여기서 확인하려는 것은 검색 결과가 아니라 "저장을 언제 하는가"이기 때문이다.
*/
const NO_SOURCES = { adapters: [] }

async function isLogged(term: string): Promise<boolean> {
  const rows = await popularQueries(200, 7)
  return rows.some((r) => r.term === term)
}

describe('응답과 뒷정리를 분리한다', () => {
  test('defer 를 주면 저장이 응답 경로에서 빠진다', async () => {
    const term = '디퍼테스트검색어'
    const deferred: Array<() => Promise<void>> = []

    const res = await search(
      { q: term, scope: 'domestic', sort: 'relevance', page: 1, perPage: 24, filters: {} },
      { federate: NO_SOURCES, defer: (task) => { deferred.push(task) } },
    )

    assert.equal(res.query, term)
    assert.equal(deferred.length, 1, '뒷정리는 한 덩어리로 미뤄진다')
    assert.equal(await isLogged(term), false, '응답 시점에는 아직 기록되지 않는다')

    await deferred[0]!()
    assert.equal(await isLogged(term), true, '미뤄진 작업이 돌면 기록된다')
  })

  test('defer 가 없으면 예전처럼 응답 전에 끝낸다 — CLI·크론은 곧 죽는다', async () => {
    const term = '동기저장테스트검색어'

    await search(
      { q: term, scope: 'domestic', sort: 'relevance', page: 1, perPage: 24, filters: {} },
      { federate: NO_SOURCES },
    )

    assert.equal(await isLogged(term), true, '응답이 끝난 시점에 이미 기록돼 있어야 한다')
  })

  test('뒤에서 도는 갱신은 검색 로그를 남기지 않는다 — 한 번의 검색이 두 번으로 세지면 안 된다', async () => {
    const term = '백그라운드테스트검색어'

    await search(
      { q: term, scope: 'domestic', sort: 'relevance', page: 1, perPage: 24, filters: {} },
      { federate: NO_SOURCES, background: true, refresh: true },
    )

    assert.equal(await isLogged(term), false)
  })
})
