/**
 * 사전에 없는 말을 제보받는 메일 링크.
 *
 * 굿즈 사전은 미번역 로그로 자동으로 자라지만, 로그는 "무엇을 몰랐는지"까지만 알려준다.
 * 그 말이 일본어로 무엇인지는 아는 사람이 알려줘야 한다. 계정도 폼 서버도 없는 우리에게
 * 메일은 0원으로 그 경로를 여는 유일한 방법이다.
 *
 * 본문을 미리 채워두는 이유는, 빈 메일 창을 받은 사람은 대부분 그냥 닫기 때문이다.
 */
export function reportMailto(opts: {
  to: string
  /** 사용자가 실제로 친 검색어 */
  term: string
  /** 그중 일본어로 옮기지 못한 말들 */
  missed?: readonly string[]
}): string {
  const { to, term, missed = [] } = opts
  const words = missed.length > 0 ? missed.join(', ') : term

  const subject = `굿즈 사전 제보: ${words}`
  const body = [
    `검색어: ${term}`,
    missed.length > 0 ? `못 옮긴 말: ${missed.join(', ')}` : null,
    '',
    '일본어 표기: ',
    '(아시는 표기를 적어주세요. 정확하지 않아도 단서만 있으면 찾아볼 수 있습니다)',
  ]
    .filter((line) => line !== null)
    .join('\n')

  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
