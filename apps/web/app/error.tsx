'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">화면을 그리다 문제가 생겼습니다</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        잠깐의 문제일 수 있습니다. 다시 시도해 보시고, 계속 그러면 알려주세요.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-10 items-center rounded-lg px-5 text-sm font-semibold text-white"
        style={{ background: 'var(--brand)' }}
      >
        다시 시도
      </button>
    </main>
  )
}
