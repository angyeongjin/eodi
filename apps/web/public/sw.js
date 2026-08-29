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
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열린 탭이 있으면 그걸 재사용한다. 누를 때마다 탭이 늘어나면 짜증난다.
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
