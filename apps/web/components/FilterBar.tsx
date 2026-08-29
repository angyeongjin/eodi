import type { Facets, SearchResponse } from '@eodi/core'
import { KIND_LABEL, SORT_LABEL, SOURCE_LABEL } from '@eodi/core'
import { buildHref, toggleInList } from '@/lib/params'
import { wonShort } from '@/lib/format'

type Params = Record<string, string | string[] | undefined>

function Chip({
  href, active, children,
}: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium"
      style={{
        borderColor: active ? 'var(--brand)' : 'var(--border)',
        background: active ? 'var(--brand-weak)' : 'var(--surface)',
        color: active ? 'var(--brand-text)' : 'var(--text)',
      }}
    >
      {children}
    </a>
  )
}

/**
 * 드롭다운은 <details> 로 만든다.
 * 자바스크립트 없이 동작하고, 검색엔진이 링크를 그대로 따라갈 수 있다.
 *
 * 주의: 이 컴포넌트를 `overflow-x-auto` 컨테이너 안에 넣으면 안 된다.
 * 열린 패널이 컨테이너 높이(칩 한 줄, 36px)에 잘려서 옵션을 아예 클릭할 수 없게 된다.
 * 실제로 그렇게 배포됐고, 마켓·가격·종류·지역 네 필터가 통째로 죽어 있었다.
 */
function Dropdown({
  label, active, children,
}: { label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-medium"
        style={{
          borderColor: active ? 'var(--brand)' : 'var(--border)',
          background: active ? 'var(--brand-weak)' : 'var(--surface)',
          color: active ? 'var(--brand-text)' : 'var(--text)',
        }}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path fill="currentColor" d="M1 3l4 4 4-4z" />
        </svg>
      </summary>
      <div
        className="absolute left-0 z-30 mt-2 max-h-[min(70vh,420px)] min-w-[220px] overflow-y-auto rounded-xl border p-2 shadow-lg"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {children}
      </div>
    </details>
  )
}

function Row({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
      style={{ background: active ? 'var(--brand-weak)' : 'transparent', color: active ? 'var(--brand-text)' : 'var(--text)' }}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className="tnum text-xs" style={{ color: 'var(--text-muted)' }}>
          {count.toLocaleString('ko-KR')}
        </span>
      )}
    </a>
  )
}

const PRICE_PRESETS: Array<[string, string | undefined, string | undefined]> = [
  ['전체', undefined, undefined],
  ['5만원 이하', undefined, '50000'],
  ['5~20만원', '50000', '200000'],
  ['20~50만원', '200000', '500000'],
  ['50~100만원', '500000', '1000000'],
  ['100만원 이상', '1000000', undefined],
]

export default function FilterBar({
  params, facets, res,
}: { params: Params; facets: Facets; res: SearchResponse }) {
  const cur = (k: string) => {
    const v = params[k]
    return (Array.isArray(v) ? v[0] : v) ?? ''
  }
  const sort = res.sort
  const activeSources = cur('src').split(',').filter(Boolean)
  const activeKinds = cur('kind').split(',').filter(Boolean)
  const hasPrice = Boolean(cur('min') || cur('max'))
  const hasRegion = Boolean(cur('region'))

  return (
    <div className="space-y-2">
      {/* 정렬은 링크뿐이라 가로 스크롤이어도 안전하다 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {(Object.keys(SORT_LABEL) as Array<keyof typeof SORT_LABEL>).map((k) => (
          <Chip key={k} href={buildHref(params, { sort: k === 'relevance' ? undefined : k })} active={sort === k}>
            {SORT_LABEL[k]}
          </Chip>
        ))}
      </div>

      {/*
        여기는 절대 overflow-x-auto 를 쓰지 않는다 (위 주석 참고).
        칩이 넘치면 가로로 밀지 않고 줄을 바꾼다.
      */}
      <div className="flex flex-wrap gap-2">
        <Dropdown label={activeSources.length ? `마켓 ${activeSources.length}` : '마켓'} active={activeSources.length > 0}>
          <Row href={buildHref(params, { src: undefined })} active={activeSources.length === 0} label="전체" />
          {facets.sources.map((s) => (
            <Row
              key={s.id}
              href={buildHref(params, { src: toggleInList(params.src, s.id) })}
              active={activeSources.includes(s.id)}
              label={SOURCE_LABEL[s.id]}
              count={s.count}
            />
          ))}
        </Dropdown>

        <Dropdown label={hasPrice ? '가격 ✓' : '가격'} active={hasPrice}>
          {PRICE_PRESETS.map(([label, min, max]) => (
            <Row
              key={label}
              href={buildHref(params, { min, max })}
              active={cur('min') === (min ?? '') && cur('max') === (max ?? '')}
              label={label}
            />
          ))}
          <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--border)' }}>
            {facets.priceBuckets.map((b) => (
              <Row
                key={`${b.from}-${b.to}`}
                href={buildHref(params, { min: String(b.from), max: b.to ? String(b.to) : undefined })}
                active={cur('min') === String(b.from) && cur('max') === (b.to ? String(b.to) : '')}
                label={b.to ? `${wonShort(b.from)}~${wonShort(b.to)}원` : `${wonShort(b.from)}원 이상`}
                count={b.count}
              />
            ))}
          </div>
        </Dropdown>

        <Dropdown label={activeKinds.length ? `종류 ${activeKinds.length}` : '종류'} active={activeKinds.length > 0}>
          <Row href={buildHref(params, { kind: undefined })} active={activeKinds.length === 0} label="기본 (매입·서비스 제외)" />
          {facets.kinds.map((k) => (
            <Row
              key={k.id}
              href={buildHref(params, { kind: toggleInList(params.kind, k.id) })}
              active={activeKinds.includes(k.id)}
              label={KIND_LABEL[k.id]}
              count={k.count}
            />
          ))}
        </Dropdown>

        {facets.regions.length > 0 && (
          <Dropdown label={hasRegion ? `지역 ✓` : '지역'} active={hasRegion}>
            <Row href={buildHref(params, { region: undefined })} active={!hasRegion} label="전체" />
            {facets.regions.map((r) => (
              <Row
                key={r.name}
                href={buildHref(params, { region: r.name })}
                active={cur('region') === r.name}
                label={r.name}
                count={r.count}
              />
            ))}
          </Dropdown>
        )}

        <Chip href={buildHref(params, { sold: cur('sold') === '1' ? undefined : '1' })} active={cur('sold') === '1'}>
          판매완료 포함
        </Chip>
        <Chip href={buildHref(params, { days: cur('days') === '7' ? undefined : '7' })} active={cur('days') === '7'}>
          최근 7일
        </Chip>
      </div>
    </div>
  )
}
