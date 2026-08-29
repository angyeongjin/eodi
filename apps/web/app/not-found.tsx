import Link from 'next/link'
import SearchBox from '@/components/SearchBox'
import { Header, Footer } from '@/components/Layout'

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">이 주소에는 아무것도 없습니다</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          대신 물건을 찾아볼까요?
        </p>
        <div className="mt-6">
          <SearchBox size="lg" />
        </div>
        <Link href="/" className="mt-6 inline-block text-sm underline" style={{ color: 'var(--text-muted)' }}>
          홈으로
        </Link>
      </main>
      <Footer />
    </>
  )
}
