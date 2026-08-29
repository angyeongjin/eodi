import { SCOPE_LABEL, type MarketScope } from '@eodi/core'
import { buildHref } from '@/lib/params'

type Params = Record<string, string | string[] | undefined>

/**
 * 국내 / 일본 탭.
 *
 * 두 시장을 한 목록에 섞지 않는 이유는 가격이 비교 가능한 값이 아니기 때문이다.
 * 일본 매물의 실제 지출은 표시가 + 구매대행 수수료 + 국제배송 + 관세다.
 * 섞어 보여주면 "일본이 훨씬 싸다"는 착각을 준다.
 */
const TABS: Array<{ scope: MarketScope; sub: string }> = [
  { scope: 'domestic', sub: '번개장터 · 당근 · 중고나라 · 헬로마켓' },
  { scope: 'overseas', sub: '야후옥션 · 메루카리 — 굿즈·피규어' },
]

export default function ScopeTabs({ params, current }: { params: Params; current: MarketScope }) {
  return (
    <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }} role="tablist">
      {TABS.map((t) => {
        const active = t.scope === current
        return (
          <a
            key={t.scope}
            role="tab"
            aria-selected={active}
            href={buildHref(params, { scope: t.scope === 'domestic' ? undefined : t.scope })}
            className="-mb-px border-b-2 px-3 py-2 text-sm"
            style={{
              borderColor: active ? 'var(--brand)' : 'transparent',
              color: active ? 'var(--brand-text)' : 'var(--text-muted)',
              fontWeight: active ? 700 : 500,
            }}
          >
            {SCOPE_LABEL[t.scope]}
            <span className="ml-1.5 hidden text-[11px] font-normal sm:inline" style={{ color: 'var(--text-muted)' }}>
              {t.sub}
            </span>
          </a>
        )
      })}
    </div>
  )
}
