import { SITE } from '@/lib/config'

/**
 * 인피드 광고 자리.
 * 광고 스크립트가 설정되지 않았으면 아무것도 렌더하지 않는다 —
 * 빈 회색 상자를 보여주는 것보다 없는 게 낫다.
 * 자리를 차지할 때는 높이를 미리 잡아 레이아웃이 밀리지 않게 한다.
 */
export default function AdSlot() {
  if (!SITE.adsenseClient || !SITE.adsenseInfeedSlot) return null
  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', minHeight: 120 }}
    >
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        광고
      </span>
      <ins
        className="adsbygoogle block"
        style={{ display: 'block', minHeight: 90 }}
        data-ad-client={SITE.adsenseClient}
        data-ad-slot={SITE.adsenseInfeedSlot}
        data-ad-format="fluid"
        data-full-width-responsive="true"
      />
    </div>
  )
}
