import { Header, Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'

export const metadata = { title: '개인정보처리방침' }

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed">
        <h1 className="text-xl font-bold">개인정보처리방침</h1>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>최종 개정일: 2026-08-29</p>

        <div className="mt-6 space-y-5" style={{ color: 'var(--text-muted)' }}>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>1. 수집하지 않는 정보</h2>
            <p>
              {SITE.name}는 회원가입이 없으며 이름·이메일·전화번호·주소 등 개인을 식별할 수 있는 정보를 수집하지 않습니다.
              로그인 기능이 없고 이용자 계정도 만들지 않습니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>2. 수집하는 정보</h2>
            <p>
              서비스 개선을 위해 다음을 저장합니다.<br />
              · <strong style={{ color: 'var(--text)' }}>검색어</strong>와 결과 건수, 응답 시간 — 인기 검색어 집계와 성능 개선에 사용합니다. 이용자 식별자와 연결하지 않습니다.<br />
              · 서버 접근 로그 — 호스팅 사업자(Vercel)가 보안·장애 대응 목적으로 일정 기간 보관합니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>3. 찜과 알림</h2>
            <p>
              · <strong style={{ color: 'var(--text)' }}>찜한 매물</strong>은 이용자의 브라우저(localStorage)에만 저장되며
              서비스 서버로 전송되지 않습니다. 브라우저 데이터를 지우면 함께 사라집니다.<br />
              · <strong style={{ color: 'var(--text)' }}>키워드 알림</strong>을 켜면 브라우저가 발급한 푸시 구독 정보와
              검색어·필터 조건을 저장합니다. 이름·이메일·전화번호는 받지 않으며, 구독 주소는 해시로만 조회합니다.<br />
              · 알림 해제는 브라우저 알림 권한을 끄거나 알림 목록에서 삭제하면 됩니다. 삭제 시 저장된 구독 정보도 함께 지웁니다.<br />
              · 발송에 연속 실패한 구독(브라우저 삭제·권한 해제 등)은 자동으로 비활성화하고 정리합니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>4. 쿠키</h2>
            <p>
              서비스 자체는 추적용 쿠키를 사용하지 않습니다. 광고가 게재되는 경우 Google AdSense 가 쿠키를 사용할 수 있으며,
              이용자는 <a className="underline" href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google 광고 설정</a>에서 맞춤 광고를 끌 수 있습니다.
            </p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>5. 보관 기간</h2>
            <p>검색 로그는 최대 180일, 수집된 매물 정보는 최대 90일 보관 후 삭제합니다.</p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>6. 제3자 제공</h2>
            <p>수집한 정보를 제3자에게 판매하거나 제공하지 않습니다. 법령에 따른 요구가 있는 경우에 한해 제공될 수 있습니다.</p>
          </section>
          <section>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>7. 문의</h2>
            <p><a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
