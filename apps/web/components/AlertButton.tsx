'use client'

import { useEffect, useState } from 'react'
import type { MarketScope, SearchFilters } from '@eodi/core'

type State =
  | 'idle' | 'insecure' | 'unsupported' | 'ios-needs-install'
  | 'busy' | 'on' | 'denied' | 'error'

/** iOS/iPadOS Safari 는 홈 화면에 추가해야만 푸시가 켜진다 (iOS 16.4+) */
function isIosNotInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return isIos && !standalone
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

interface Props {
  term: string
  scope: MarketScope
  filters: SearchFilters
}

/**
 * 키워드 알림 등록 버튼.
 *
 * 앱 없이 알림을 주는 유일한 길이 웹 푸시라, 브라우저마다 사정이 다르다.
 * 안 되는 브라우저에는 **왜 안 되는지와 어떻게 하면 되는지**를 말해준다.
 * "지원하지 않습니다"만 띄우면 사용자는 우리 서비스가 고장난 줄 안다.
 */
export default function AlertButton({ term, scope, filters }: Props) {
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    /*
      서비스워커는 보안 컨텍스트(HTTPS 또는 localhost)에서만 등록된다.
      LAN IP(http://192.168.x.x)로 접속하면 API 자체가 없어서
      "브라우저가 지원하지 않는다"처럼 보이는데, 브라우저 잘못이 아니다.
      원인을 정확히 말해야 사용자가 우리 서비스가 고장났다고 오해하지 않는다.
    */
    if (!window.isSecureContext) {
      setState('insecure')
      return
    }
    if (isIosNotInstalled()) {
      setState('ios-needs-install')
      return
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') setState('denied')
  }, [])

  async function subscribe() {
    setState('busy')
    setMessage('')
    try {
      const keyRes = await fetch('/api/alerts/key')
      const { publicKey } = (await keyRes.json()) as { publicKey?: string }
      if (!publicKey) {
        setState('error')
        setMessage('알림 기능이 아직 준비 중입니다.')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('denied')
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }))

      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), term, scope, filters }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setState('error')
        setMessage(body.error ?? '알림을 켜지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setState('on')
    } catch (err) {
      setState('error')
      setMessage('알림을 켜지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.')
    }
  }

  if (state === 'insecure') {
    return (
      <Hint>
        알림은 <strong>https 주소</strong>에서만 켤 수 있습니다. 지금은 안전하지 않은 연결(http)로 접속 중입니다.
      </Hint>
    )
  }
  if (state === 'ios-needs-install') {
    return (
      <Hint>
        아이폰·아이패드는 <strong>공유 → 홈 화면에 추가</strong> 후 알림을 켤 수 있습니다. 앱 설치는 아닙니다.
      </Hint>
    )
  }
  if (state === 'unsupported') {
    return <Hint>이 브라우저는 웹 알림을 지원하지 않습니다. 크롬·엣지·파이어폭스에서 사용해 주세요.</Hint>
  }
  if (state === 'denied') {
    return <Hint>알림이 차단되어 있습니다. 브라우저 주소창의 자물쇠 → 알림 허용으로 바꿔주세요.</Hint>
  }
  if (state === 'on') {
    return (
      <span
        className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold"
        style={{ background: 'var(--brand-weak)', color: 'var(--brand-text)' }}
      >
        알림 켜짐 — 새 매물이 올라오면 알려드릴게요
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={subscribe}
        disabled={state === 'busy'}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
          <path
            fill="currentColor"
            d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.6L2.3 11a.7.7 0 0 0 .6 1.1h10.2a.7.7 0 0 0 .6-1.1l-1.2-2.4V6A4.5 4.5 0 0 0 8 1.5Zm0 13a2 2 0 0 0 1.9-1.4H6.1A2 2 0 0 0 8 14.5Z"
          />
        </svg>
        {state === 'busy' ? '등록 중…' : '새 매물 알림 받기'}
      </button>
      {message && (
        <span className="text-xs" style={{ color: 'var(--warn)' }}>
          {message}
        </span>
      )}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-lg border px-3 py-1.5 text-xs"
      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
    >
      {children}
    </p>
  )
}
