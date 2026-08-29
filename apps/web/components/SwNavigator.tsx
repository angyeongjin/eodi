'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/*
  서비스워커가 "이 주소로 가 달라"고 보내면 페이지가 스스로 옮겨 간다.

  알림을 눌렀을 때 워커가 창을 직접 옮기는 게 원칙이지만,
  설치된 PWA 는 그 창이 워커의 제어를 받지 않는 경우가 있어 navigate() 가 거부된다.
  그때 앱만 앞으로 나오고 화면은 홈에 머문다 — 실제로 그런 제보를 받았다.
  워커가 못 하면 페이지가 한다.
*/
export default function SwNavigator() {
  const router = useRouter()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null
      if (!data || data.type !== 'eodi:navigate' || !data.url) return
      try {
        const u = new URL(data.url, window.location.origin)
        // 워커가 보낸 값이라도 우리 오리진 밖으로는 보내지 않는다
        if (u.origin !== window.location.origin) return
        router.push(u.pathname + u.search)
      } catch {
        /* 주소가 이상하면 아무것도 하지 않는다 */
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  return null
}
