import Link from 'next/link'
import { suggestCorrection, type MarketScope } from '@eodi/core'

/*
  "혹시 이걸 찾으셨나요".

  굿즈 이름은 외래어 음차라 표기가 흔들린다. 사전에 없으면 지금까지는 0건을 주고
  끝냈는데, 사람은 자기가 틀렸는지 물건이 없는 건지 알 수 없었다.

  자판을 안 바꾸고 친 경우도 여기서 받는다. "wntnfghlwjs" 를 0건으로
  돌려보내는 건 서비스가 게으른 것이다.
*/
export default function DidYouMean({
  query,
  scope,
  /**
   * 결과가 몇 건 나왔는지.
   *
   * 자판을 안 바꾼 것은 결과가 있어도 알려야 한다 — 마켓은 의미 없는 문자열에도
   * 뭔가를 돌려주기 때문에(실제로 "wntnfghlwjs" 가 50건이었다) 0건만 보고 있으면
   * 영영 못 알린다. 반면 철자 제안은 결과가 있을 때 들이밀면 잔소리가 된다.
   */
  resultCount = 0,
}: {
  query: string
  scope: MarketScope
  resultCount?: number
}) {
  const fix = suggestCorrection(query)
  if (!fix) return null
  if (fix.reason === 'spelling' && resultCount > 0) return null

  const href = `/search?q=${encodeURIComponent(fix.suggestion)}${scope === 'overseas' ? '&scope=overseas' : ''}`
  return (
    <p className="mt-3 text-sm">
      {fix.reason === 'keyboard' ? '한글로 바꾸면 ' : '혹시 '}
      <Link href={href} className="font-semibold underline" style={{ color: 'var(--brand-text)' }}>
        {fix.suggestion}
      </Link>
      {fix.reason === 'keyboard' ? ' 입니다.' : ' 를 찾으셨나요?'}
    </p>
  )
}
