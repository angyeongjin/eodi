import { Header, Footer } from '@/components/Layout'
import SavedList from '@/components/SavedList'
import SearchBox from '@/components/SearchBox'

export const metadata = {
  title: '찜한 매물',
  // 개인 목록이라 검색엔진에 올릴 이유가 없다
  robots: { index: false, follow: false },
}

export default function SavedPage() {
  return (
    <>
      <Header>
        <SearchBox />
      </Header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-lg font-bold">찜한 매물</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          이 브라우저에만 저장됩니다. 계정이 없으니 다른 기기와 공유되지 않고, 우리 서버에도 남지 않습니다.
        </p>
        <SavedList />
      </main>
      <Footer />
    </>
  )
}
