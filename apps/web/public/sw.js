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
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const same = all.filter((c) => {
        try {
          return new URL(c.url).origin === target.origin
        } catch (_) {
          return false
        }
      })

      // 이미 그 화면이면 데려다 놓기만 하면 된다
      const exact = same.find((c) => c.url === target.href)
      if (exact) return exact.focus()

      for (const client of same) {
        try {
          const navigated = await client.navigate(target.href)
          return (navigated || client).focus()
        } catch (_) {
          /*
            navigate() 는 이 워커가 제어하지 않는 창에서 거부된다.
            설치된 PWA 는 그 창이 앞으로 나오기만 하고 주소는 그대로라, 눌러도 홈이 보인다.
            openWindow 도 같은 태스크를 되살릴 뿐이라 소용이 없다.
            그래서 창에 직접 부탁한다 — 페이지가 스스로 옮겨 간다.
          */
          try {
            client.postMessage({ type: 'eodi:navigate', url: target.href })
            return client.focus()
          } catch (_) {
            /* 이 창은 포기하고 다음 창 */
          }
        }
      }

      return self.clients.openWindow(target.href)
    })(),
  )
})
