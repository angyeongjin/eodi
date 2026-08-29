import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/config'

/**
 * 기본 OG 이미지.
 *
 * 주 유통 채널이 트위터 굿즈 계정이라 링크 카드가 밋밋하면 눌리지 않는다.
 * 외부 폰트를 받지 않고 시스템 렌더링만 쓴다 — 빌드가 네트워크에 의존하면 안 된다.
 */
export const runtime = 'nodejs'
export const alt = `${SITE.name} — ${SITE.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 88px',
          background: '#0e1116',
          color: '#e8eaed',
        }}
      >
        <div style={{ fontSize: 34, color: '#ff7d4d', fontWeight: 700 }}>{SITE.name}</div>
        <div style={{ fontSize: 68, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>
          일본 굿즈를 한글로 검색
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 34, fontSize: 34 }}>
          <span style={{ color: '#9aa4b2' }}>주술회전 아크릴스탠드</span>
          <span style={{ color: '#ff7d4d' }}>→</span>
          <span>呪術廻戦 アクリルスタンド</span>
        </div>
        <div style={{ fontSize: 26, color: '#9aa4b2', marginTop: 40 }}>
          야후옥션 · 메루카리 · 번개장터 · 당근마켓 · 중고나라 · 헬로마켓
        </div>
      </div>
    ),
    size,
  )
}
