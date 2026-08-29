/**
 * 옛 주소에서 새 주소로 보내는 규칙.
 *
 * 도메인을 옮기면 이미 색인된 주소와 남이 공유해둔 링크가 옛 호스트를 가리킨 채로 남는다.
 * 301 로 넘겨야 검색엔진이 새 주소로 평가를 옮기고, 링크를 눌러 들어온 사람이 빈손으로 돌아가지 않는다.
 *
 * **두 값이 다 있을 때만 규칙이 생긴다.** 도메인을 사기 전에는 아무 일도 일어나지 않으므로,
 * 이 코드가 배포돼 있어도 현재 동작은 그대로다. 전환은 코드 수정이 아니라 환경변수로 한다.
 *
 * @typedef {{ source: string, has: Array<{ type: 'host', value: string }>, destination: string, permanent: true }} HostRedirect
 *
 * @param {{ siteUrl?: string, legacyHosts?: string }} env
 *   siteUrl: 새 정식 주소(NEXT_PUBLIC_SITE_URL). legacyHosts: 쉼표로 구분한 옛 호스트(LEGACY_HOSTS)
 * @returns {HostRedirect[]}
 */
export function legacyRedirects(env) {
  const { siteUrl, legacyHosts } = env ?? {}
  if (!siteUrl || !legacyHosts) return []

  let canonical
  try {
    canonical = new URL(siteUrl)
  } catch {
    // 주소를 해석하지 못하면 리다이렉트를 만들지 않는다. 잘못된 목적지로 보내느니 그대로 두는 편이 낫다.
    return []
  }
  if (canonical.protocol !== 'https:' && canonical.protocol !== 'http:') return []

  const origin = `${canonical.protocol}//${canonical.host}`
  const seen = new Set()
  /** @type {HostRedirect[]} */
  const rules = []

  for (const raw of legacyHosts.split(',')) {
    const host = raw.trim().toLowerCase()
    if (!host) continue
    // 자기 자신을 옛 호스트로 넣으면 무한 리다이렉트가 된다. 설정 실수를 코드가 막는다.
    if (host === canonical.host.toLowerCase()) continue
    if (seen.has(host)) continue
    seen.add(host)

    rules.push({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: `${origin}/:path*`,
      permanent: true,
    })
  }

  return rules
}
