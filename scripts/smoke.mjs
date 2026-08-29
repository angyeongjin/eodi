/**
 * 릴리즈 게이트용 스모크 테스트.
 * 실제로 뜬 서버에 여러 검색어를 던져 "쓸 만한 결과가 나오는가"를 검사한다.
 *   node scripts/smoke.mjs http://localhost:3000
 */
const base = process.argv[2] ?? 'http://localhost:3000'

const QUERIES = [
  { q: '아이폰16 프로', minResults: 20, expectKind: 'item' },
  { q: '삼성 냉장고', minResults: 20, expectKind: 'item' },
  { q: '자전거', minResults: 20 },
  { q: '허먼밀러 의자', minResults: 10 },
  { q: '에어팟 프로 2', minResults: 20, expectKind: 'item' },
  { q: '닌텐도 스위치 2', minResults: 15 },
  { q: '맥북 에어 M2 100만원 이하', minResults: 5, maxPrice: 1_000_000 },
  { q: '캠핑 텐트', minResults: 5 },
  { q: 'zzzz존재하지않는물건zzzz', minResults: 0 },
  // 일본 굿즈 — 한글 검색어가 일본어로 번역돼 결과가 나와야 한다
  { q: '피규어', scope: 'overseas', minResults: 20, expectCurrency: 'JPY' },
  { q: '주술회전 아크릴스탠드', scope: 'overseas', minResults: 10, expectCurrency: 'JPY' },
  { q: '넨도로이드 미쿠', scope: 'overseas', minResults: 10, expectCurrency: 'JPY' },
  // 사전에 없는 말 — 지어내지 않고 0건 + 안내
  { q: '한샘 4인용 식탁', scope: 'overseas', minResults: 0, expectUntranslated: true },
]

let failed = 0
const line = (ok, msg) => console.log(`${ok ? '  ok  ' : ' FAIL '} ${msg}`)

console.log(`대상: ${base}\n`)

for (const t of QUERIES) {
  const url =
    `${base}/api/search?q=${encodeURIComponent(t.q)}&perPage=24` +
    (t.scope ? `&scope=${t.scope}` : '')
  const t0 = Date.now()
  let data
  try {
    const res = await fetch(url)
    if (!res.ok) {
      line(false, `${t.q} — HTTP ${res.status}`)
      failed++
      continue
    }
    data = await res.json()
  } catch (err) {
    line(false, `${t.q} — ${err.message}`)
    failed++
    continue
  }
  const ms = Date.now() - t0
  const checks = []

  checks.push([data.total >= t.minResults, `결과 ${data.total}건 (최소 ${t.minResults})`])

  if (t.minResults > 0) {
    const kinds = data.items.map((i) => i.kind)
    if (t.expectKind) {
      const n = kinds.filter((k) => k === t.expectKind).length
      checks.push([n >= Math.ceil(data.items.length * 0.5), `상위 ${data.items.length}건 중 ${t.expectKind} ${n}건`])
    }
    const sources = new Set(data.items.flatMap((i) => i.sources))
    checks.push([sources.size >= 1, `노출 마켓 ${[...sources].join('+')}`])
    checks.push([data.items.every((i) => i.url?.startsWith('http')), '모든 매물에 원본 링크'])
    checks.push([data.items.every((i) => Number.isFinite(i.price)), '모든 매물에 가격'])
    if (t.maxPrice) {
      checks.push([data.items.every((i) => i.price <= t.maxPrice), `가격 조건 ${t.maxPrice} 이하 준수`])
    }
    const okSources = data.sources.filter((s) => s.ok).length
    // 실시간 조회가 막혀 인덱스로 답하는 것은 설계된 열화 동작이지 실패가 아니다.
    // 다만 그 사실을 응답이 밝히고 있어야 한다.
    checks.push([
      okSources >= 1 || data.indexOnly === true,
      okSources >= 1 ? `응답한 소스 ${okSources}개` : '인덱스로 대체 응답(indexOnly)',
    ])

    if (t.expectCurrency) {
      const wrong = data.items.filter((i) => (i.currency ?? 'KRW') !== t.expectCurrency)
      checks.push([wrong.length === 0, `통화 ${t.expectCurrency} 일관 (예외 ${wrong.length}건)`])
      // 원화 환산가가 없으면 필터·정렬이 전부 어긋난다
      const noKrw = data.items.filter((i) => !Number.isFinite(i.priceKrw) || i.priceKrw <= 0)
      checks.push([noKrw.length === 0, `원화 환산가 채워짐 (누락 ${noKrw.length}건)`])
      checks.push([Boolean(data.fx?.jpyToKrw), `환율 ${data.fx?.jpyToKrw ?? '?'}`])
      checks.push([Boolean(data.interpreted.overseasTerm), `일본어 변환 "${data.interpreted.overseasTerm ?? ''}"`])
    }
    if (t.scope) checks.push([data.scope === t.scope, `시장 ${data.scope}`])
  }

  if (t.expectUntranslated) {
    checks.push([data.interpreted.overseasTerm == null, '번역 못 했음을 알림'])
    checks.push([(data.interpreted.untranslated ?? []).length > 0, `미해결어 ${(data.interpreted.untranslated ?? []).join(',')}`])
  }
  checks.push([ms < 12_000, `응답 ${ms}ms`])

  const allOk = checks.every(([ok]) => ok)
  if (!allOk) failed++
  console.log(`${allOk ? '✅' : '❌'} "${t.q}"`)
  for (const [ok, msg] of checks) line(ok, msg)
  console.log()
}

/*
  필터 드롭다운이 잘려서 클릭 불가였던 적이 있다.
  칩 줄에 overflow-x-auto 가 걸려 있으면 열린 패널이 36px 높이에 잘린다.
  마크업만으로 잡을 수 있는 회귀라 스모크에서 본다.
*/
{
  const res = await fetch(`${base}/search?q=${encodeURIComponent('아이폰16 프로')}`)
  const html = await res.text()
  const chipRow = html.match(/<div class="[^"]*flex[^"]*"[^>]*>\s*<details/g) ?? []
  const clipped = chipRow.filter((m) => /overflow-x-auto/.test(m))
  const okFilter = clipped.length === 0 && html.includes('<details')
  if (!okFilter) failed++
  console.log(
    `${okFilter ? '✅' : '❌'} 필터 드롭다운 — ` +
      (okFilter
        ? '스크롤 컨테이너에 갇히지 않음'
        : `overflow-x-auto 안에 <details> 가 ${clipped.length}개 있어 패널이 잘립니다`),
  )
}

// 페이지가 실제로 렌더되는지
const PAGES = [
  ['/', 500, '어디있지'],
  ['/search?q=%EC%95%84%EC%9D%B4%ED%8F%B016', 500, '건'],
  ['/about', 500, '데이터 출처'],
  ['/terms', 500, '이용약관'],
  ['/privacy', 500, '개인정보'],
  ['/status', 500, '소스 상태'],
  ['/s/%EC%9E%90%EC%A0%84%EA%B1%B0', 500, '자전거'],
  ['/jp/%ED%94%BC%EA%B7%9C%EC%96%B4', 500, 'フィギュア'],
  ['/jp/%EC%A3%BC%EC%88%A0%ED%9A%8C%EC%A0%84', 500, '呪術廻戦'],
  // 작품 지면 — 캐릭터 목록이 비면 지면의 존재 이유가 사라진다
  ['/w/%EC%A3%BC%EC%88%A0%ED%9A%8C%EC%A0%84', 500, '캐릭터로 찾기'],
  ['/w/%EC%A3%BC%EC%88%A0%ED%9A%8C%EC%A0%84', 500, '고죠'],
  // 줄임말로 들어와도 정식 표기 지면이 나와야 한다
  ['/w/%ED%9E%88%EB%A1%9C%EC%95%84%EC%B9%B4', 500, '나의히어로아카데미아'],
  // 자판을 안 바꾸고 친 검색어. 마켓이 엉뚱한 결과를 주므로 0건 화면으로는 못 잡는다
  ['/search?q=wntnfghlwjs', 500, '한글로 바꾸면'],
  ['/search?q=%ED%94%BC%EA%B7%9C%EC%96%B4&scope=overseas', 500, '구매대행'],
  ['/saved', 500, '찜한 매물'],
  ['/manifest.webmanifest', 100, 'standalone'],
  ['/sw.js', 300, 'notificationclick'],
  ['/api/alerts/key', 10, 'publicKey'],
  ['/robots.txt', 40, 'Sitemap'],
  ['/sitemap.xml', 500, '<urlset'],
]
for (const [path, minBytes, needle] of PAGES) {
  try {
    const res = await fetch(base + path)
    const html = await res.text()
    const ok = res.ok && html.length >= minBytes && html.includes(needle)
    if (!ok) failed++
    console.log(`${ok ? '✅' : '❌'} ${path} — HTTP ${res.status}, ${html.length}B${ok ? '' : ` (기대 문자열 "${needle}" 없음)`}`)
  } catch (err) {
    failed++
    console.log(`❌ ${path} — ${err.message}`)
  }
}

console.log(`\n${failed === 0 ? '전부 통과' : `${failed}건 실패`}`)
process.exit(failed === 0 ? 0 : 1)
