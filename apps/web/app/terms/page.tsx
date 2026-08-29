import { Header, Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'

export const metadata = { title: '이용약관' }

export default function TermsPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed">
        <h1 className="text-xl font-bold">이용약관</h1>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>최종 개정일: 2026-08-29</p>

        <div className="mt-6 space-y-5" style={{ color: 'var(--text-muted)' }}>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>제1조 (목적)</h2>
            <p>이 약관은 {SITE.name}(이하 “서비스”)가 제공하는 중고마켓 통합검색 서비스의 이용 조건을 정합니다.</p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>제2조 (서비스의 성격)</h2>
            <p>
              ① 서비스는 제3자 중고거래 플랫폼이 공개한 검색 결과를 모아 보여주는 <strong>메타 검색 서비스</strong>입니다.<br />
              ② 서비스는 매물의 판매자도, 구매자도, 중개자도 아닙니다. 통신판매중개자에 해당하지 않으며 거래에 관여하지 않습니다.<br />
              ③ 매물의 등록·수정·삭제 권한은 각 플랫폼과 판매자에게 있습니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>제3조 (책임의 한계)</h2>
            <p>
              ① 서비스는 표시된 매물 정보의 정확성·최신성·완전성을 보증하지 않습니다. 원본 플랫폼에서 이미 삭제되었거나 가격이 바뀌었을 수 있습니다.<br />
              ② 이용자와 판매자 사이에 발생한 거래·분쟁·손해에 대해 서비스는 책임지지 않습니다.<br />
              ③ 서비스는 제3자 플랫폼의 사정으로 일부 또는 전부의 검색 결과가 제공되지 않을 수 있습니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>제4조 (이용자의 의무)</h2>
            <p>
              ① 이용자는 서비스를 자동화된 방법으로 과도하게 호출하거나, 결과를 상업적으로 재배포해서는 안 됩니다.<br />
              ② 이용자는 거래 전 원본 플랫폼에서 매물 정보를 직접 확인해야 합니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>제5조 (권리 귀속과 게재 중단)</h2>
            <p>
              ① 각 매물의 제목·이미지 등에 대한 권리는 원 게시자와 해당 플랫폼에 있습니다.<br />
              ② 권리자 또는 플랫폼이 게재 중단을 요청하면 서비스는 지체 없이 해당 데이터의 수집과 노출을 중단합니다.
              요청은 <a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> 으로 접수합니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>제6조 (서비스의 변경·중단)</h2>
            <p>서비스는 사전 고지 후 내용을 변경하거나 제공을 중단할 수 있으며, 긴급한 사유가 있는 경우 사후에 고지할 수 있습니다.</p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
