import type { SearchResponse } from '@eodi/core'
import { SOURCE_LABEL } from '@eodi/core'

/**
 * 어느 마켓을 실제로 뒤졌는지 항상 보여준다.
 * 소스가 조용히 빠지는 것이 통합검색에서 가장 나쁜 실패다.
 */
export default function SourceStatusBar({ res }: { res: SearchResponse }) {
  // 정책상 꺼둔 소스는 장애가 아니다. 섞어서 알리면 사용자가 서비스를 못 믿는다.
  const failed = res.sources.filter((s) => !s.ok && !s.disabled)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        {res.sources.map((s) => (
          <span key={s.source} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: s.ok ? 'var(--ok)' : s.disabled ? 'var(--border)' : 'var(--warn)' }}
            />
            {SOURCE_LABEL[s.source]}
            {s.regionLabel && <span>({s.regionLabel})</span>}
            {s.ok ? <span className="tnum">{s.count}</span> : <span>{s.disabled ? '미지원' : '미응답'}</span>}
          </span>
        ))}
        <span>·</span>
        <span className="tnum">{res.tookMs}ms</span>
        {res.cached && <span>· 캐시</span>}
        {res.fromIndex > 0 && <span className="tnum">· 인덱스 +{res.fromIndex}</span>}
      </div>

      {res.indexOnly && (
        <p
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--warn-weak)', borderColor: 'var(--border)', color: 'var(--warn)' }}
        >
          지금 마켓에 직접 물어보지 못해, 최근에 수집해 둔 매물을 보여주고 있습니다. 이미 팔린 물건이 섞여 있을 수 있습니다.
        </p>
      )}

      {!res.indexOnly && failed.length > 0 && (
        <p
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--warn-weak)', borderColor: 'var(--border)', color: 'var(--warn)' }}
        >
          일부 마켓이 응답하지 않아 결과가 빠졌을 수 있습니다 —{' '}
          {failed.map((s) => SOURCE_LABEL[s.source]).join(', ')}
        </p>
      )}
    </div>
  )
}
