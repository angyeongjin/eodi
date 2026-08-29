import { buildHref } from '@/lib/params'

type Params = Record<string, string | string[] | undefined>

export default function Pagination({
  params, page, perPage, total,
}: { params: Params; page: number; perPage: number; total: number }) {
  const last = Math.max(1, Math.ceil(total / perPage))
  if (last <= 1) return null

  const window = 2
  const from = Math.max(1, page - window)
  const to = Math.min(last, page + window)
  const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i)

  const link = (p: number) => buildHref(params, { page: p === 1 ? undefined : String(p) })

  return (
    <nav className="flex items-center justify-center gap-1 pt-2" aria-label="페이지">
      {page > 1 && (
        <a href={link(page - 1)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          이전
        </a>
      )}
      {from > 1 && <span className="px-1 text-sm" style={{ color: 'var(--text-muted)' }}>…</span>}
      {pages.map((p) => (
        <a
          key={p}
          href={link(p)}
          aria-current={p === page ? 'page' : undefined}
          className="tnum min-w-9 rounded-lg border px-3 py-2 text-center text-sm"
          style={{
            borderColor: p === page ? 'var(--brand)' : 'var(--border)',
            background: p === page ? 'var(--brand-weak)' : 'var(--surface)',
            color: p === page ? 'var(--brand-text)' : 'var(--text)',
          }}
        >
          {p}
        </a>
      ))}
      {to < last && <span className="px-1 text-sm" style={{ color: 'var(--text-muted)' }}>…</span>}
      {page < last && (
        <a href={link(page + 1)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          다음
        </a>
      )}
    </nav>
  )
}
