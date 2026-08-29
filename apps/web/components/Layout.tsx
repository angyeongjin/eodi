import Link from 'next/link'
import { SITE } from '@/lib/config'
import ThemeToggle from './ThemeToggle'
import Wordmark from './Wordmark'

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="shrink-0" aria-label={`${SITE.name} 홈`}>
          <Wordmark />
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <ThemeToggle />
        <Link
          href="/saved"
          aria-label="찜한 매물"
          title="찜한 매물"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M10 17.5 3.5 11.2a4.2 4.2 0 0 1 5.9-6l.6.6.6-.6a4.2 4.2 0 0 1 5.9 6L10 17.5Z"
              fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-5xl px-4 py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
        <p className="mb-3">
          {SITE.name}는 각 중고마켓이 공개한 검색 결과를 모아 보여주는 <strong>메타 검색 서비스</strong>입니다.
          매물의 등록·거래·분쟁은 해당 마켓과 판매자의 책임이며, {SITE.name}는 거래 당사자가 아닙니다.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/about">서비스 소개 · 데이터 출처</Link>
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/saved">찜한 매물</Link>
          <Link href="/status">소스 상태</Link>
          <a href={`mailto:${SITE.contactEmail}`}>문의 · 게재 중단 요청</a>
        </nav>
        <p className="mt-4">© {new Date().getFullYear()} {SITE.name}</p>
      </div>
    </footer>
  )
}
