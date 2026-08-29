import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/*
  서비스 워커는 브라우저에서만 도는 파일이라 손대도 아무도 안 잡아준다.
  실제로 알림을 눌러도 홈만 뜨는 버그가 조용히 살아 있었다 —
  navigate() 실패를 기다리지 않고 focus() 를 돌려주고 있었다.
  가짜 clients 를 물려 클릭 한 번을 그대로 재생한다.
*/

interface FakeClient { url: string; focused?: boolean; navigatedTo?: string; canNavigate: boolean }

function run(clients: FakeClient[], notifUrl: string) {
  const opened: string[] = []
  const handlers: Record<string, (e: unknown) => void> = {}
  const pending: Array<Promise<unknown>> = []

  const self = {
    location: { origin: 'https://eodi.vercel.app' },
    addEventListener: (name: string, fn: (e: unknown) => void) => { handlers[name] = fn },
    registration: { showNotification: () => Promise.resolve() },
    clients: {
      matchAll: () => Promise.resolve(clients.map((c) => ({
        url: c.url,
        focus: () => { c.focused = true; return Promise.resolve(c) },
        navigate: (u: string) => {
          if (!c.canNavigate) return Promise.reject(new TypeError('uncontrolled'))
          c.navigatedTo = u
          return Promise.resolve({ ...c, focus: () => { c.focused = true; return Promise.resolve(c) } })
        },
      }))),
      openWindow: (u: string) => { opened.push(u); return Promise.resolve(null) },
      claim: () => Promise.resolve(),
    },
    skipWaiting: () => undefined,
  }

  const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf-8')
  vm.createContext({ self, URL, TypeError, Promise, console })
  vm.runInContext(src, vm.createContext({ self, URL, TypeError, Promise, console }))
  // 위 컨텍스트는 버려지므로 한 번만 만들어 쓴다
  const ctx = vm.createContext({ self, URL, TypeError, Promise, console })
  vm.runInContext(src, ctx)

  handlers.notificationclick?.({
    notification: { close: () => undefined, data: { url: notifUrl } },
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  })
  return { opened, done: Promise.all(pending) }
}

const TARGET = 'https://eodi.vercel.app/search?q=%EB%B0%94%EC%BF%A0%EA%B3%A0'

describe('알림을 누르면 그 검색으로 간다', () => {
  test('제어 중인 창이 있으면 그 창을 해당 주소로 옮긴다', async () => {
    const c: FakeClient = { url: 'https://eodi.vercel.app/', canNavigate: true }
    const { opened, done } = run([c], TARGET)
    await done
    assert.equal(c.navigatedTo, TARGET, '창을 알림 주소로 옮겨야 한다')
    assert.equal(c.focused, true)
    assert.deepEqual(opened, [], '기존 창을 두고 새 창을 열지 않는다')
  })

  test('navigate 가 거부되면 새 창을 연다', async () => {
    // 워커가 제어하지 않는 창에서 navigate() 는 실패한다. 예전에는 이때 홈만 떴다.
    const c: FakeClient = { url: 'https://eodi.vercel.app/', canNavigate: false }
    const { opened, done } = run([c], TARGET)
    await done
    assert.deepEqual(opened, [TARGET], '실패했으면 새 창으로라도 데려가야 한다')
  })

  test('열린 창이 없으면 새 창을 연다', async () => {
    const { opened, done } = run([], TARGET)
    await done
    assert.deepEqual(opened, [TARGET])
  })

  test('이미 그 화면이면 옮기지 않고 앞으로만 가져온다', async () => {
    const c: FakeClient = { url: TARGET, canNavigate: true }
    const { opened, done } = run([c], TARGET)
    await done
    assert.equal(c.focused, true)
    assert.equal(c.navigatedTo, undefined)
    assert.deepEqual(opened, [])
  })
})
