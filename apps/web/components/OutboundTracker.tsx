'use client'

import type { MarketScope } from '@eodi/core'

/**
 * 원본 마켓으로 나가는 클릭을 센다.
 *
 * 카드마다 클라이언트 컴포넌트를 만들지 않고 목록 하나에 위임 리스너를 건다.
 * 결과가 24개든 100개든 자바스크립트는 이 한 덩어리뿐이고, `ResultCard` 는 서버 컴포넌트로 남는다.
 *
 * 전송은 `sendBeacon` 이다. 클릭 직후 페이지가 새 탭으로 넘어가도 요청이 살아남고,
 * 무엇보다 **응답을 기다리지 않는다** — 계측 때문에 원본으로 가는 게 늦어지면 주객이 전도된다.
 * 실패는 전부 삼킨다. 못 센 클릭보다 안 열린 매물이 훨씬 나쁘다.
 */
export default function OutboundTracker({
  scope,
  normalized,
  children,
}: {
  scope: MarketScope
  /** 정규화된 검색어. 원문 대신 이것만 보낸다 */
  normalized: string
  children: React.ReactNode
}) {
  function track(e: React.MouseEvent<HTMLDivElement>) {
    try {
      const target = e.target
      if (!(target instanceof Element)) return
      const link = target.closest('a[data-outbound]')
      if (!link) return

      const source = link.getAttribute('data-outbound')
      if (!source) return
      const posAttr = link.getAttribute('data-pos')
      const position = posAttr === null ? null : Number(posAttr)

      const body = JSON.stringify({
        kind: 'outbound',
        scope,
        source,
        position: Number.isInteger(position) ? position : null,
        normalized,
      })

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/event', body)
        return
      }
      // sendBeacon 이 없는 브라우저용 폴백. keepalive 로 페이지 이탈에도 살아남는다.
      void fetch('/api/event', { method: 'POST', body, keepalive: true }).catch(() => {})
    } catch {
      /* 계측은 절대 사용자의 클릭을 막지 않는다 */
    }
  }

  // 가운데 클릭(새 탭)도 이탈이다. onClick 만 걸면 헤비 유저의 클릭이 통째로 빠진다.
  return (
    <div onClick={track} onAuxClick={track}>
      {children}
    </div>
  )
}
