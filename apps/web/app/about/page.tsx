import { Header, Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'
import { allAdapters } from '@eodi/crawler'

export const metadata = { title: '서비스 소개 · 데이터 출처' }

export default function AboutPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-bold">{SITE.name}는 어떤 서비스인가요</h1>
        <div className="prose-sm mt-4 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="mb-1 font-semibold">한 번 검색해서 여러 마켓을 봅니다</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              중고 물건을 찾을 때 번개장터, 당근마켓, 중고나라, 헬로마켓을 각각 열어 같은 검색어를 반복해서 치게 됩니다.
              {SITE.name}는 그 검색을 한 번으로 줄입니다. 검색어를 넣으면 각 마켓에 동시에 물어보고,
              결과를 하나의 목록으로 합쳐서 보여줍니다.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">중복 매물을 묶습니다</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              같은 판매자가 여러 마켓에 올린 같은 물건은 한 장의 카드로 묶고, 어느 마켓에 올라와 있는지 함께 표시합니다.
              잘못 묶는 것이 놓치는 것보다 나쁘다고 보기 때문에, 제목·가격·시각이 충분히 일치할 때만 묶습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">판매글이 아닌 글을 걸러냅니다</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              “매입합니다”, “삽니다”, 대여·수리 광고는 기본으로 감춥니다. 감추는 것이지 지우는 것이 아니라서,
              필터에서 언제든 다시 켤 수 있습니다. 케이스·부품·게임 타이틀도 라벨을 붙여 구분합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">일본 굿즈를 한글로 찾습니다</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              야후옥션·메루카리에 &ldquo;피규어&rdquo;라고 치면 결과가 하나도 나오지 않습니다. 일본어로 쳐야 하니까요.
              {SITE.name}는 굿즈 사전을 두고 &ldquo;주술회전 아크릴스탠드&rdquo;를 <strong>呪術廻戦 アクリルスタンド</strong>로
              바꿔서 대신 찾아줍니다. 사전에 없는 말은 지어내지 않고 모른다고 말한 뒤 기록해 두었다가 사전에 추가합니다.
            </p>
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
              일본 매물은 국내와 같은 목록에 섞지 않습니다. 표시 가격에 구매대행 수수료·국제배송비·관세가 더해져
              지불액이 다르기 때문입니다. 섞어 보여주면 &ldquo;일본이 훨씬 싸다&rdquo;는 착각을 주게 됩니다.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">데이터 출처</h2>
            <ul className="mt-2 space-y-2" style={{ color: 'var(--text-muted)' }}>
              {allAdapters().map((a) => (
                <li key={a.id}>
                  <strong style={{ color: 'var(--text)' }}>{a.label}</strong> —{' '}
                  {a.enabled ? '각 마켓이 공개한 검색 결과를 조회합니다.' : a.disabledReason}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">수집 원칙</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5" style={{ color: 'var(--text-muted)' }}>
              <li>공개적으로 제공되는 경로만 사용합니다. 로그인·우회·캡차 회피를 하지 않습니다.</li>
              <li>각 사이트의 robots.txt 를 실제로 읽고 코드 수준에서 강제합니다.</li>
              <li>사이트당 동시 요청 1건, 요청 간 최소 간격을 두어 부하를 주지 않습니다.</li>
              <li>제목·가격·지역·시각·원본 링크만 저장하며 본문 전체와 이미지는 저장하지 않습니다.</li>
              <li>썸네일은 원본 주소를 그대로 참조할 뿐 재호스팅하지 않습니다.</li>
              <li>모든 매물은 원래 마켓으로 연결되어 트래픽이 그쪽으로 돌아갑니다.</li>
              <li>게재 중단 요청을 받으면 해당 소스를 즉시 끕니다.</li>
            </ul>
            <p className="mt-3" style={{ color: 'var(--text-muted)' }}>
              제외 요청은 <a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> 으로 보내주세요.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">우리가 하지 않는 것</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5" style={{ color: 'var(--text-muted)' }}>
              <li>거래 중개·결제·에스크로를 하지 않습니다. {SITE.name}는 거래 당사자가 아닙니다.</li>
              <li>매물의 진위·상태·가격을 보증하지 않습니다.</li>
              <li>회원가입을 요구하지 않으며 개인정보를 수집하지 않습니다.</li>
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
