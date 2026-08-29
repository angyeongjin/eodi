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

interface FakeClient { url: string; focused?: boolean; navigatedTo?: string; canNavigate: boolean; messages?: unknown[] }

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
        postMessage: (m: unknown) => { (c.messages ??= []).push(m) },
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

  test('navigate 가 거부되면 창에 직접 부탁한다', async () => {
    /*
      설치된 PWA 는 워커가 제어하지 않는 창을 갖는 일이 있고, 그때 navigate() 가 거부된다.
      openWindow 를 불러도 같은 태스크가 앞으로 나올 뿐이라 화면은 홈에 머문다.
      그래서 페이지에 메시지를 보내 스스로 옮겨 가게 한다.
    */
    const c: FakeClient = { url: 'https://eodi.vercel.app/', canNavigate: false }
    const { opened, done } = run([c], TARGET)
    await done
    // vm 컨텍스트에서 건너온 객체라 프로토타입이 달라 deepEqual 이 통하지 않는다. 값으로 본다.
    const msg = (c.messages ?? [])[0] as { type?: string; url?: string } | undefined
    assert.equal(msg?.type, 'eodi:navigate', '창에 이동을 부탁해야 한다')
    assert.equal(msg?.url, TARGET)
    assert.equal(c.focused, true)
    assert.deepEqual(opened, [], '같은 태스크를 되살리는 openWindow 는 부르지 않는다')
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
