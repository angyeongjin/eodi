import type { SearchResponse } from '@eodi/core'
import DidYouMean from './DidYouMean'

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
      더해집니다. 직접 구매·배송은 되지 않으며 구매대행 서비스가 필요합니다.
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
export function TranslationMiss({ res }: { res: SearchResponse }) {
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
      {/* 사전에 없는 게 아니라 오타일 수 있다. 그 경우 먼저 되물어야 한다. */}
      <DidYouMean query={res.query} scope="overseas" />
      <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        일본어를 아신다면 직접 입력해 보세요. 이 검색어는 기록해 두고 사전에 추가하겠습니다.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
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
