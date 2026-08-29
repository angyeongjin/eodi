import { Header, Footer } from '@/components/Layout'
import { SITE } from '@/lib/config'
import {
  estimateLandedCost,
  AGENT_FEE_RATE, AGENT_FEE_MIN_KRW, INTL_SHIPPING_KRW,
  DUTY_FREE_LIMIT_KRW, DUTY_RATE, VAT_RATE,
} from '@eodi/core'

export const metadata = {
  title: '일본 굿즈, 실제로 얼마 드나',
  description:
    '일본 매물의 표시가는 지불액이 아닙니다. 구매대행 수수료·국제배송비·관세가 어떻게 붙는지, ' +
    '우리가 무엇을 가정해 추정하는지 그대로 적어둡니다.',
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const pct = (n: number) => `${Math.round(n * 100)}%`

/** 사람들이 실제로 많이 보는 가격대 */
const EXAMPLES = [3_000 * 8.62, 30_000, 120_000, 350_000].map((p) => Math.round(p))

export default function CostPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">일본 굿즈, 실제로 얼마 드나</h1>

        <p className="mt-4 leading-relaxed">
          일본 마켓의 표시가는 <strong>지불액이 아닙니다.</strong> 일본에서 한국으로 직배송되지 않기 때문에
          구매대행 서비스를 거쳐야 하고, 그 과정에서 수수료와 국제배송비가 붙습니다. 금액이 커지면 관세와
          부가세도 붙습니다. 그래서 {SITE.name}는 결과 카드에 <strong>예상 총액을 범위로</strong> 함께 보여줍니다.
        </p>

        <h2 className="mt-8 text-lg font-bold">무엇이 붙나</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed">
          <li>
            <strong>구매대행 수수료</strong> — 상품가의 {pct(AGENT_FEE_RATE.low)}~{pct(AGENT_FEE_RATE.high)},
            최소 {won(AGENT_FEE_MIN_KRW)} 안팎. 대행사마다 다르고 낙찰 대행·검품 옵션에 따라 더 붙습니다.
          </li>
          <li>
            <strong>국제배송비</strong> — 소형 굿즈(1kg 이하) 기준 {won(INTL_SHIPPING_KRW.low)}~
            {won(INTL_SHIPPING_KRW.high)}. 무게와 부피로 정해지는데 <strong>우리는 매물의 무게를 모릅니다.</strong>
            피규어처럼 상자가 큰 물건은 이 범위를 넘습니다.
          </li>
          <li>
            <strong>관세·부가세</strong> — 자가사용 물품은 보통 {won(DUTY_FREE_LIMIT_KRW)}(미화 150달러) 안쪽이면
            면세로 통관됩니다. 넘으면 관세 {pct(DUTY_RATE)}(완구·피규어 기준)와 부가세 {pct(VAT_RATE)}가 붙습니다.
            관세율은 품목마다 다릅니다.
          </li>
          <li>
            <strong>일본 내 배송비</strong> — 판매자가 표시한 경우 그대로 더합니다. 표시가 없으면 0으로 둡니다.
          </li>
        </ul>

        <h2 className="mt-8 text-lg font-bold">가격대별 예상</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="py-2 text-left font-medium">표시가(원화 환산)</th>
                <th className="py-2 text-right font-medium">예상 총액</th>
                <th className="py-2 text-right font-medium">관세 구간</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLES.map((price) => {
                const e = estimateLandedCost({ priceKrw: price })
                if (!e) return null
                return (
                  <tr key={price} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 tnum">{won(price)}</td>
                    <td className="py-2 text-right tnum">
                      {won(e.low)} ~ {won(e.high)}
                    </td>
                    <td className="py-2 text-right" style={{ color: 'var(--text-muted)' }}>
                      {e.taxed ? '과세 가능' : '면세 추정'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          표를 보면 <strong>싼 굿즈 한 점만 사는 것이 가장 불리합니다.</strong> 국제배송비는 상품가와 무관하게
          붙기 때문에, ¥500짜리 아크릴스탠드 하나를 따로 부치면 배송비가 상품가의 몇 배가 됩니다.
          대행 서비스에서 여러 점을 모아 한 번에 보내는(합배송) 이유가 이것입니다.
        </p>

        <h2 className="mt-8 text-lg font-bold">이 숫자를 믿으면 안 되는 지점</h2>
        <p className="mt-3 text-sm leading-relaxed">
          정확한 값은 <strong>낼 수 없습니다.</strong> 대행사마다 수수료 체계가 다르고, 국제배송비는 무게에
          달렸는데 우리는 무게를 모르며, 관세율은 품목별로 갈립니다. 환율도 매일 움직입니다.
          그래서 하나의 숫자 대신 범위를 주고, 무엇을 가정했는지 위에 그대로 적어두었습니다.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          <strong>실제 청구는 대행사가 합니다.</strong> 우리는 거래 당사자가 아니고 이 추정에 대해 보증하지
          않습니다. 주문 전에 대행사가 산출한 실제 견적을 반드시 확인하세요.
        </p>

        <p className="mt-8 text-xs" style={{ color: 'var(--text-muted)' }}>
          잘못된 값을 발견하셨다면 {SITE.contactEmail} 로 알려주세요. 근거와 함께 고치겠습니다.
        </p>
      </main>
      <Footer />
    </>
  )
}
