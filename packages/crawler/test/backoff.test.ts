import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fetchText, hostBackoff, resetHostBackoff, HostPausedError } from '../src/http.js'

/*
  상대가 막기 시작하면 물러서는지.

  실측에서 중고나라가 한 시간에 241건을 전부 403 으로 돌려줬다.
  그때까지 우리는 같은 속도로 계속 보내고 있었다 — 상대에게 민폐이고,
  차단은 더 길어지고, 크론은 4분을 헛되이 쓴다.
*/

const HOST = 'backoff.test'
const URL_ = `https://${HOST}/x`
const realFetch = globalThis.fetch

function stubStatus(status: number) {
  globalThis.fetch = (async () =>
    new Response(status < 400 ? 'ok' : '', { status })) as typeof fetch
}

beforeEach(() => {
  resetHostBackoff()
  globalThis.fetch = realFetch
})

describe('막히면 물러선다', () => {
  test('403 을 받으면 다음 요청 간격을 벌린다', async () => {
    stubStatus(403)
    await fetchText(URL_, { minIntervalMs: 10, respectRobots: false }).catch(() => undefined)
    const st = hostBackoff(HOST)
    assert.ok(st, '차단 기록이 남아야 한다')
    assert.equal(st.strikes, 1)
    assert.ok(st.intervalMs > 10, '간격이 늘어야 한다')
  })

  test('연속으로 막히면 아예 쉰다 — 요청을 보내지 않는다', async () => {
    stubStatus(403)
    for (let i = 0; i < 3; i++) {
      await fetchText(URL_, { minIntervalMs: 10, respectRobots: false }).catch(() => undefined)
    }
    // 쉬는 동안에는 네트워크를 건드리면 안 된다
    let called = false
    globalThis.fetch = (async () => { called = true; return new Response('', { status: 200 }) }) as typeof fetch
    await assert.rejects(
      () => fetchText(URL_, { minIntervalMs: 10, respectRobots: false }),
      (e: unknown) => e instanceof HostPausedError,
    )
    assert.equal(called, false, '쉬는 중에는 요청을 보내지 않아야 한다')
  })

  test('성공하면 원래 속도로 돌아온다', async () => {
    stubStatus(403)
    await fetchText(URL_, { minIntervalMs: 10, respectRobots: false }).catch(() => undefined)
    assert.ok(hostBackoff(HOST), '먼저 차단 기록이 있어야 한다')
    stubStatus(200)
    await fetchText(URL_, { minIntervalMs: 10, respectRobots: false })
    assert.equal(hostBackoff(HOST), null, '한 번 막혔다고 영영 느려지면 안 된다')
  })

  test('404 같은 일반 오류로는 물러서지 않는다', async () => {
    // 우리 잘못이지 상대가 막는 것이 아니다. 속도를 줄일 이유가 없다.
    stubStatus(404)
    await fetchText(URL_, { minIntervalMs: 10, respectRobots: false }).catch(() => undefined)
    assert.equal(hostBackoff(HOST), null)
  })
})
