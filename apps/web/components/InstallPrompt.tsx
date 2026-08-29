'use client'

import { useEffect, useState } from 'react'

/*
  앱으로 설치하기.

  "앱도 있으면 좋겠다"는 피드백을 받았는데, 사실 이미 앱처럼 쓸 수 있다 —
  manifest 도 서비스워커도 갖춰져 있어 홈 화면에 설치하면 주소창 없이 뜬다.
  아무도 모를 뿐이었다. 안내가 알림 설정 안에만 묻혀 있었다.

  안드로이드·PC 는 브라우저가 설치 이벤트를 주므로 버튼 한 번이면 되고,
  iOS 는 그 이벤트가 없어 "공유 → 홈 화면에 추가" 를 사람이 직접 해야 한다.
  두 경우를 다르게 안내한다 — 없는 버튼을 누르라고 하면 신뢰를 잃는다.
*/

const DISMISS_KEY = 'eodi.install.dismissed.v1'

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<Prompt | null>(null)
  const [ios, setIos] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // 이미 설치해서 열었으면 권할 이유가 없다
    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    if (installed) return

    let dismissed = false
    try { dismissed = window.localStorage.getItem(DISMISS_KEY) === '1' } catch { /* 저장소가 막혀도 동작해야 한다 */ }
    if (dismissed) return

    const ua = window.navigator.userAgent
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    if (isIos) { setIos(true); setShow(true); return }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as Prompt)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* noop */ }
  }

  return (
    <div
      className="mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">홈 화면에 두고 앱처럼 쓰기</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {ios
            ? '공유 → 홈 화면에 추가. 앱스토어 설치가 아닙니다.'
            : '주소창 없이 열리고, 키워드 알림도 받을 수 있습니다.'}
        </p>
      </div>
      {!ios && deferred && (
        <button
          type="button"
          onClick={async () => {
            await deferred.prompt()
            await deferred.userChoice.catch(() => null)
            setShow(false)
          }}
          className="h-9 shrink-0 rounded-lg px-4 text-sm font-semibold text-white"
          style={{ background: 'var(--brand)' }}
        >
          설치
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:opacity-70"
        style={{ color: 'var(--text-muted)' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
