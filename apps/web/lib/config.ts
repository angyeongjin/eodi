/*
  내부 식별자와 외부 노출 이름을 일부러 분리한다.

  - 코드·패키지(@eodi/*)·스토리지 키는 `eodi` 그대로 둔다. 바꿔봐야 사용자에게 보이지 않고,
    스토리지 키를 건드리면 이미 찜해둔 목록이 날아간다.
  - 사람에게 보이는 이름은 한글 `어디있지`, 라틴 표기와 도메인은 `eodizzi` 다.
    `eodi` 는 좋은 도메인이 이미 다 나갔고, 라틴으로 읽었을 때 뜻도 전달되지 않는다.
*/
export const SITE = {
  name: '어디있지',
  /** 도메인·User-Agent 등 라틴 표기가 필요한 곳 */
  latinName: 'eodizzi',
  tagline: '일본 굿즈 · 국내 중고 통합검색',
  description:
    '일본 굿즈를 한글로 검색합니다. 야후옥션·메루카리를 굿즈 사전으로 찾아주고 가품·개조 표기를 짚어줍니다. ' +
    '국내는 번개장터·당근마켓·중고나라·헬로마켓을 한 번에 검색합니다.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eodizzi.com',
  /** 비어 있으면 광고 슬롯이 아예 렌더되지 않는다 */
  adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '',
  adsenseInfeedSlot: process.env.NEXT_PUBLIC_ADSENSE_INFEED_SLOT ?? '',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'hello@eodizzi.com',
} as const
