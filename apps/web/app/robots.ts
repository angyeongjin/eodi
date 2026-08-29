import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/config'

export default function robots(): MetadataRoute.Robots {
  const base = SITE.url.replace(/\/$/, '')
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 실시간 조회 경로는 크롤러에게 열지 않는다. 대신 /s/ 정적 랜딩을 준다.
        disallow: ['/api/', '/search'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
