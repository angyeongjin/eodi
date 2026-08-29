import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/config'

/**
 * PWA 매니페스트.
 *
 * 앱을 만들지 않는 대신 이걸 둔다.
 * 안드로이드·PC 는 이게 없어도 푸시가 되지만, **iOS 는 홈 화면에 추가해야만 푸시가 켜진다.**
 * 그래서 iOS 사용자를 위해서라도 설치 가능한 형태를 갖춰야 한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/?utm_source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ff6b35',
    lang: 'ko',
    categories: ['shopping'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '찜한 매물', url: '/saved' },
      { name: '일본 굿즈', url: '/jp/피규어' },
    ],
  }
}
