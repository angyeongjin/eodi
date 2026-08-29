import { REGIONS, findRegion, DEFAULT_REGION_SLUG } from '@eodi/crawler'
import { buildHref } from '@/lib/params'

type Params = Record<string, string | string[] | undefined>

/**
 * 당근마켓은 검색이 동네 단위로 갈린다(지역이 다르면 결과가 거의 겹치지 않는다).
 * 그래서 "어느 동네를 보고 있는지"를 감추지 않고 사용자가 직접 고르게 한다.
 */
export default function RegionPicker({ params, current }: { params: Params; current?: string }) {
  const slug = current ?? DEFAULT_REGION_SLUG
  const region = findRegion(slug)

  const grouped = new Map<string, typeof REGIONS>()
  for (const r of REGIONS) {
    const arr = grouped.get(r.province)
    if (arr) arr.push(r)
    else grouped.set(r.province, [r])
  }

  return (
    <details className="relative">
      <summary
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-medium"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path fill="currentColor" d="M6 0a4 4 0 0 1 4 4c0 3-4 8-4 8S2 7 2 4a4 4 0 0 1 4-4Zm0 2.5A1.5 1.5 0 1 0 6 5.5a1.5 1.5 0 0 0 0-3Z" />
        </svg>
        당근 동네: {region ? `${region.city} ${region.dong}` : '기본'}
      </summary>
      <div
        className="absolute left-0 z-20 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border p-2 shadow-lg"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="px-2 pb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          당근마켓 결과만 이 동네 기준으로 바뀝니다. 다른 마켓은 전국 검색입니다.
        </p>
        {[...grouped.entries()].map(([province, list]) => (
          <div key={province} className="mb-1">
            <p className="px-2 pt-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {province}
            </p>
            {list.map((r) => (
              <a
                key={r.slug}
                href={buildHref(params, { in: r.slug })}
                className="block rounded-lg px-2 py-1.5 text-sm"
                style={{
                  background: r.slug === slug ? 'var(--brand-weak)' : 'transparent',
                  color: r.slug === slug ? 'var(--brand-text)' : 'var(--text)',
                }}
              >
                {r.city} {r.dong}
              </a>
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}
