import { hasDb, indexStats, sourceHealthSummary, alertStats } from '@eodi/db'
import { allAdapters } from '@eodi/crawler'
import { SCOPE_LABEL, type MarketScope } from '@eodi/core'
import { SOURCE_LABEL, KIND_LABEL, type ListingKind } from '@eodi/core'
import { Header, Footer } from '@/components/Layout'
import { relativeTime } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: '소스 상태' }

export default async function StatusPage() {
  const [index, health, alerts] = await Promise.all([indexStats(), sourceHealthSummary(24), alertStats()])

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-bold">소스 상태</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          어느 마켓이 지금 정상인지 숨기지 않고 공개합니다.
        </p>

        {(['domestic', 'overseas'] as MarketScope[]).map((scope) => (
        <section className="mt-6" key={scope}>
          <h2 className="mb-2 text-sm font-semibold">{SCOPE_LABEL[scope]} 마켓</h2>
          <ul className="space-y-2">
            {allAdapters(scope).map((a) => {
              const h = health.find((x) => x.source === a.id)
              return (
                <li
                  key={a.id}
                  className="rounded-xl border p-3 text-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <div className="flex items-center justify-between">
                    <strong>{a.label}</strong>
                    <span
                      className="rounded px-2 py-0.5 text-xs"
                      style={{
                        background: a.enabled ? 'var(--brand-weak)' : 'var(--surface-2)',
                        color: a.enabled ? 'var(--brand-text)' : 'var(--text-muted)',
                      }}
                    >
                      {a.enabled ? '사용 중' : '비활성'}
                    </span>
                  </div>
                  {a.disabledReason && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {a.disabledReason}
                    </p>
                  )}
                  {h && (
                    <p className="tnum mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      최근 24시간 성공률 {(h.okRate * 100).toFixed(0)}% · 평균 {h.avgDurationMs}ms · 표본 {h.samples}
                      {h.lastError ? ` · 최근 오류: ${h.lastError}` : ''}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
        ))}

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">키워드 알림</h2>
          <div
            className="rounded-xl border p-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <p className="tnum">
              활성 {alerts.active.toLocaleString('ko-KR')}개 / 전체 {alerts.total.toLocaleString('ko-KR')}개
            </p>
            <p className="tnum mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              최근 24시간 발송 {alerts.notified24h.toLocaleString('ko-KR')}건 · 계정 없이 브라우저 구독으로만 동작합니다
            </p>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">수집 인덱스</h2>
          {!hasDb() ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              데이터베이스가 연결되어 있지 않습니다. 검색은 실시간 연합 조회로만 동작합니다.
            </p>
          ) : (
            <div
              className="rounded-xl border p-3 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <p className="tnum">
                총 {index.total.toLocaleString('ko-KR')}건
                {index.newestAt ? ` · 마지막 갱신 ${relativeTime(index.newestAt)}` : ''}
              </p>
              <p className="tnum mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {index.bySource.map((s) => `${SOURCE_LABEL[s.source]} ${s.count.toLocaleString('ko-KR')}`).join(' · ')}
              </p>
              <p className="tnum mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {index.byKind
                  .map((k) => `${KIND_LABEL[k.kind as ListingKind] ?? k.kind} ${k.count.toLocaleString('ko-KR')}`)
                  .join(' · ')}
              </p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  )
}
