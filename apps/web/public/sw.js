/*
 * 서비스 워커.
 *
 * 하는 일은 두 가지뿐이다 — 푸시를 받아 알림으로 띄우고, 알림을 누르면 해당 검색으로 보낸다.
 * 오프라인 캐싱은 하지 않는다. 중고 매물은 실시간성이 전부라 낡은 목록을 보여주면 오히려 해롭다.
 */

self.addEventListener('install', () => {
  // 새 워커를 즉시 활성화한다. 알림 로직이 바뀌었는데 옛 워커가 남아 있으면 디버깅이 지옥이 된다.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    data = {}
  }

  const title = data.title || '새 매물이 있습니다'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // 같은 알림 규칙의 푸시는 하나로 덮어쓴다. 알림창이 쌓이면 사람은 전부 꺼버린다.
    tag: data.tag || 'eodi',
    renotify: true,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = (event.notification.data && event.notification.data.url) || '/'
  const target = new URL(raw, self.location.origin)

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      for (const client of list) {
        let sameOrigin = false
        try {
          sameOrigin = new URL(client.url).origin === target.origin
        } catch (_) {
          sameOrigin = false
        }
        if (!sameOrigin) continue

        // 이미 그 화면이면 데려다 놓기만 하면 된다
        if (client.url === target.href) return client.focus()

        /*
          navigate() 는 이 워커가 제어하지 않는 창에서 거부된다.
          예전에는 결과를 기다리지 않고 focus() 를 돌려줘서, 실패해도 조용히
          홈에 열려 있던 창만 앞으로 나왔다 — 알림을 눌러도 상품이 안 보였다.
          실패하면 새 창을 연다.
        */
        try {
          const navigated = await client.navigate(target.href)
          return (navigated || client).focus()
        } catch (_) {
          break
        }
      }

      return self.clients.openWindow(target.href)
    })(),
  )
})
