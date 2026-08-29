import Link from 'next/link'
import { search } from '@eodi/crawler'
import type { MarketScope } from '@eodi/core'

/*
  반대편 탭에 답이 있는지 알려준다.

  일본 탭에서 "이 말은 아직 모른다"로 끝내면, 사용자는 사전 구멍인지 물건이 없는 건지
  구분할 수 없다. 그런데 애초에 일본에 없는 물건일 수도 있다 — 로스트아크 "카단" 처럼
  한국에서만 발매된 것은 일본어로 옮겨봐야 0건이거나 엉뚱한 결과가 나온다
  (실제로 ロストアーク 는 인디아나 존스 영화 굿즈를 물어 왔다).

  그래서 사전을 키워 맞히려 들지 않고, 반대편에서 실제로 몇 건 나오는지 세어 보여준다.
  모르는 캐릭터가 새로 들어와도 막다른 길이 되지 않는다.
*/
export default async function CrossScopeHint({
  query,
  scope,
}: {
  query: string
  scope: MarketScope
}) {
  /*
    반대편을 실제로 검색해 세어 본다. 캐시가 있으면 공짜고, 없으면 마켓을 한 번 더 부른다.
    실패 화면에서만 일어나는 일이고, 그 결과는 사용자가 건너갈 탭을 미리 데워 두는 셈이라
    비용을 감수한다. async 라 본문을 막지 않고 뒤이어 스트리밍된다.
  */
  const other: MarketScope = scope === 'overseas' ? 'domestic' : 'overseas'
  const res = await search({ q: query, perPage: 1, scope: other }, { persist: false }).catch(() => null)
  const n = res?.total ?? 0
  if (n === 0) return null

  const href = `/search?q=${encodeURIComponent(query)}${other === 'overseas' ? '&scope=overseas' : ''}`
  const label = other === 'overseas' ? '일본 마켓' : '국내 마켓'

  return (
    <p className="mt-4 text-sm">
      <Link href={href} className="font-semibold underline" style={{ color: 'var(--brand-text)' }}>
        {label}에는 {n.toLocaleString('ko-KR')}건
      </Link>
      <span style={{ color: 'var(--text-muted)' }}> 있습니다.</span>
    </p>
  )
}
