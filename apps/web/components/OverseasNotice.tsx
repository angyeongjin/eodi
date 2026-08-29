import type { SearchResponse } from '@eodi/core'
import { buildHref } from '@/lib/params'
import { reportMailto } from '@/lib/report'
import { SITE } from '@/lib/config'

type Params = Record<string, string | string[] | undefined>

/**
 * 해외 탭 고정 안내.
 *
 * 표시 가격은 지불액이 아니다. 이걸 감추면 사용자를 속이는 것이 된다.
 * 목록 어디에도 "최저가" 같은 표현을 쓰지 않는다.
 */
export default function OverseasNotice({ res }: { res: SearchResponse }) {
  const fx = res.fx
  return (
    <div
      className="rounded-xl border p-3 text-xs leading-relaxed"
      style={{ background: 'var(--warn-weak)', borderColor: 'var(--border)', color: 'var(--warn)' }}
    >
      <strong>표시 가격은 일본 현지 판매가입니다.</strong> 실제 지출에는 구매대행 수수료·국제배송비·관세가
      더해집니다. 직접 구매·배송은 되지 않으며 구매대행 서비스가 필요합니다.{' '}
      <a href="/cost" className="underline">얼마나 더 붙는지 보기</a>
      {fx && (
        <span className="ml-1 opacity-80">
          (환산 기준 100엔 = {Math.round(fx.jpyToKrw * 100).toLocaleString('ko-KR')}원
          {fx.asOf && fx.asOf !== 'default' ? ` · ${fx.asOf.slice(0, 10)}` : ''})
        </span>
      )}
    </div>
  )
}

/** 사전에 없어 일본어로 못 옮긴 경우 */
export function TranslationMiss({ res, params }: { res: SearchResponse; params: Params }) {
  const missed = res.interpreted.untranslated ?? []
  return (
    <div className="mt-8 rounded-xl border p-6 text-center" style={{ borderColor: 'var(--border)' }}>
      <p className="font-semibold">
        {missed.length > 0
          ? `'${missed.join("', '")}' 을(를) 일본어로 어떻게 부르는지 아직 모릅니다`
          : '이 검색어를 일본어로 옮기지 못했습니다'}
      </p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        일본 마켓은 한글 검색어에 아무 결과도 주지 않습니다. 그래서 우리가 일본어로 바꿔서 찾는데,
        <br className="hidden sm:block" />
        아직 사전에 없는 말이라 엉뚱한 결과를 보여주는 대신 솔직히 말씀드립니다.
      </p>
      <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        일본어를 아신다면 직접 입력해 보세요. 이 검색어는 기록해 두고 사전에 추가하겠습니다.
      </p>

      {/*
        막다른 길에서 사용자가 할 수 있는 일을 둔다.
        - 아는 사람은 알려줄 수 있게: 사전이 자라는 유일한 사람 경로다
        - 모르는 사람은 국내에서라도 찾을 수 있게: 일본에 없다고 국내에 없는 것은 아니다
      */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <a
          href={reportMailto({ to: SITE.contactEmail, term: res.query, missed })}
          className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white"
          style={{ background: 'var(--brand)' }}
        >
          일본어 표기 알려주기
        </a>
        <a
          /* 일본 소스·지역 필터를 들고 국내 탭으로 가면 또 0건이다 — 없애려던 막다른 길이 그대로 남는다 */
          href={buildHref(params, { scope: undefined, src: undefined, region: undefined })}
          className="inline-flex h-9 items-center rounded-lg border px-4 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          국내 마켓에서 찾아보기
        </a>
      </div>

      <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        사전에 있는 말은 이렇게 찾습니다
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {['피규어', '넨도로이드', '아크릴스탠드', '캔뱃지', '주술회전', '포켓몬'].map((k) => (
          <a
            key={k}
            href={`/search?q=${encodeURIComponent(k)}&scope=overseas`}
            className="inline-flex h-8 items-center rounded-full border px-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            {k}
          </a>
        ))}
      </div>
    </div>
  )
}

/** 어떤 말이 어떻게 번역됐는지 — 틀렸으면 사용자가 알아챌 수 있어야 한다 */
export function TranslationBar({ res }: { res: SearchResponse }) {
  const hits = res.interpreted.translationHits ?? []
  if (!res.interpreted.overseasTerm) return null
  return (
    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
      일본어로 <strong style={{ color: 'var(--text)' }}>{res.interpreted.overseasTerm}</strong> 를 찾았습니다
      {hits.length > 0 && <span className="ml-1">({hits.map((h) => `${h.ko}→${h.ja}`).join(', ')})</span>}
      {res.interpreted.untranslated?.length ? (
        <span className="ml-1">· 옮기지 못한 말: {res.interpreted.untranslated.join(', ')}</span>
      ) : null}
    </p>
  )
}
