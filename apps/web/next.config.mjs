import { legacyRedirects } from './lib/redirects.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 워크스페이스 패키지는 빌드된 dist 를 그대로 쓴다
  serverExternalPackages: ['postgres'],
  /*
    도메인 전환용. LEGACY_HOSTS 가 비어 있으면 규칙이 만들어지지 않으므로
    이 코드가 배포돼 있어도 현재 동작은 그대로다. 자세한 건 lib/redirects.mjs.
  */
  async redirects() {
    return legacyRedirects({
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      legacyHosts: process.env.LEGACY_HOSTS,
    })
  },
  async headers() {
    const adsense = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
      ? ' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com'
      : ''
    /*
     * 썸네일은 각 마켓 CDN 에서 직접 불러오므로 img-src 를 열어둘 수밖에 없다.
     * 대신 스크립트·연결 대상은 좁게 잠근다.
     */
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'${adsense}`,
      "style-src 'self' 'unsafe-inline'",
      'img-src * data: blob:',
      "font-src 'self' data:",
      `connect-src 'self'${adsense}`,
      `frame-src 'self'${adsense}`,
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}
export default nextConfig
