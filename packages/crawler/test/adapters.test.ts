import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDaangnHtml } from '../src/adapters/daangn.js'
import { parseJoongnaHtml } from '../src/adapters/joongna.js'
import { parseHellomarketHtml } from '../src/adapters/hellomarket.js'
import { parseYahooHtml } from '../src/adapters/yahoo.js'
import { allAdapters, activeAdapters } from '../src/adapters/index.js'
import { extractJsonArray, readNextFlightPayload, readNextDataJson } from '../src/parse.js'
import { parseRobots, isAllowed } from '../src/robots.js'
import { USER_AGENT, uaToken } from '../src/http.js'
import { federate } from '../src/federate.js'
import { REGIONS, findRegion, prewarmRegions, regionsByProvince } from '../src/regions.js'
import type { SourceAdapter } from '../src/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(resolve(here, 'fixtures/daangn-search.html'), 'utf-8')

describe('robots.txt 파서', () => {
  const txt = `
User-agent: *
Disallow: /admin
Disallow: /kr/buy-sell/s/
Allow: /kr/buy-sell/

User-agent: BadBot
Disallow: /
`
  test('와일드카드 그룹을 읽는다', () => {
    const r = parseRobots(txt, uaToken())
    assert.ok(r.disallow.includes('/admin'))
    assert.ok(r.disallow.includes('/kr/buy-sell/s/'))
  })
  test('우리가 쓰는 경로는 허용된다', () => {
    const r = parseRobots(txt, uaToken())
    assert.equal(isAllowed(r, '/kr/buy-sell/?search=x'), true)
  })
  test('막힌 경로는 막는다', () => {
    const r = parseRobots(txt, uaToken())
    assert.equal(isAllowed(r, '/kr/buy-sell/s/foo'), false)
    assert.equal(isAllowed(r, '/admin/panel'), false)
  })
  test('우리 UA를 명시한 그룹이 있으면 그것을 따른다', () => {
    const r = parseRobots(`
User-agent: *
Disallow:

User-agent: EodizziBot
Disallow: /private
`, uaToken())
    assert.equal(isAllowed(r, '/private/x'), false)
  })

  test('robots 매칭 토큰이 실제 UA 와 일치한다', () => {
    // 상수로 따로 적어두면 UA 를 바꿀 때 같이 안 바뀐다.
    // 그러면 사이트가 우리를 이름으로 지목해 막아도 조용히 무시하게 된다.
    assert.ok(USER_AGENT.toLowerCase().startsWith(uaToken()), `UA "${USER_AGENT}" 와 토큰 "${uaToken()}" 불일치`)
  })
  test('Allow 가 더 구체적이면 이긴다', () => {
    const r = parseRobots('User-agent: *\nDisallow: /a/\nAllow: /a/b/', uaToken())
    assert.equal(isAllowed(r, '/a/b/c'), true)
    assert.equal(isAllowed(r, '/a/x'), false)
  })
  test('Crawl-delay 를 읽는다', () => {
    const r = parseRobots('User-agent: *\nCrawl-delay: 3', uaToken())
    assert.equal(r.crawlDelayMs, 3000)
  })
  test('빈 robots 는 전부 허용', () => {
    assert.equal(isAllowed(parseRobots('', 'x'), '/anything'), true)
  })
})

describe('당근 파서', () => {
  test('중첩 대괄호를 넘어 배열을 정확히 잘라낸다', () => {
    const raw = extractJsonArray('{"a":[1,[2,"]"],3]}', 'a')
    assert.equal(raw, '[1,[2,"]"],3]')
  })
  test('키가 없으면 null', () => {
    assert.equal(extractJsonArray('{"b":[1]}', 'a'), null)
  })
  test('실제 검색 페이지에서 매물을 뽑는다', () => {
    const rows = parseDaangnHtml(fixture)
    assert.ok(rows.length > 0)
    const first = rows[0]!
    assert.equal(first.source, 'daangn')
    assert.ok(first.title.length > 0)
    assert.ok(first.price > 0)
    assert.ok(first.url.startsWith('https://www.daangn.com/'))
    assert.ok(first.sourceItemId.length > 0)
  })
  test('판매완료 상태를 반영한다', () => {
    const rows = parseDaangnHtml(fixture)
    assert.ok(rows.some((r) => r.sold === true) || rows.every((r) => r.sold === false))
  })
  test('매물마다 고유 ID 가 나온다', () => {
    const rows = parseDaangnHtml(fixture)
    assert.equal(new Set(rows.map((r) => r.sourceItemId)).size, rows.length)
  })
  test('깨진 HTML 에도 터지지 않는다', () => {
    assert.deepEqual(parseDaangnHtml('<html></html>'), [])
    assert.deepEqual(parseDaangnHtml('{"fleamarketArticles":[{oops]}'), [])
  })
})

describe('지역 카탈로그', () => {
  test('지역이 로드된다', () => {
    assert.ok(REGIONS.length >= 40)
    assert.ok(REGIONS.every((r) => r.slug.includes('-') && r.province && r.dong))
  })
  test('slug 로 찾는다', () => {
    const r = REGIONS[0]!
    assert.equal(findRegion(r.slug)?.id, r.id)
    assert.equal(findRegion('없는지역-0'), undefined)
  })
  test('예열 지역은 시·도별로 골고루 뽑힌다', () => {
    const picked = prewarmRegions(10)
    assert.equal(picked.length, 10)
    assert.ok(new Set(picked.map((r) => r.province)).size >= 5)
  })
  test('시·도별 그룹핑', () => {
    const g = regionsByProvince()
    assert.ok(g.some((x) => x.province === '서울특별시'))
  })
})

describe('연합검색 오케스트레이션', () => {
  const ok = (id: 'bunjang' | 'daangn', n: number, delay = 0): SourceAdapter => ({
    id, label: id, enabled: true,
    async search() {
      if (delay) await new Promise((r) => setTimeout(r, delay))
      return Array.from({ length: n }, (_, i) => ({
        source: id, sourceItemId: `${id}-${i}`, title: `${id} 매물 ${i}`,
        price: 10_000 * (i + 1), url: `https://x/${id}/${i}`,
      }))
    },
  })
  const broken = (id: 'bunjang' | 'daangn'): SourceAdapter => ({
    id, label: id, enabled: true,
    async search() { throw new Error('차단됨') },
  })

  test('여러 소스 결과를 합친다', async () => {
    const r = await federate('테스트', { adapters: [ok('bunjang', 3), ok('daangn', 2)] })
    assert.equal(r.listings.length, 5)
    assert.equal(r.statuses.filter((s) => s.ok).length, 2)
  })

  test('한 소스가 죽어도 나머지로 응답한다', async () => {
    const r = await federate('테스트', { adapters: [ok('bunjang', 3), broken('daangn')] })
    assert.equal(r.listings.length, 3)
    const bad = r.statuses.find((s) => s.source === 'daangn')!
    assert.equal(bad.ok, false)
    assert.match(bad.error!, /차단됨/)
  })

  test('느린 소스는 기다리지 않는다', async () => {
    const t0 = Date.now()
    const r = await federate('테스트', {
      adapters: [ok('bunjang', 2), ok('daangn', 99, 3000)],
      timeoutMs: 150,
    })
    assert.ok(Date.now() - t0 < 1500)
    assert.equal(r.listings.length, 2)
    assert.match(r.statuses.find((s) => s.source === 'daangn')!.error!, /시간 초과/)
  })

  test('모든 소스가 죽어도 예외를 던지지 않는다', async () => {
    const r = await federate('테스트', { adapters: [broken('bunjang'), broken('daangn')] })
    assert.equal(r.listings.length, 0)
    assert.ok(r.statuses.every((s) => !s.ok))
  })
})

describe('중고나라 파서', () => {
  const jnFixture = readFileSync(resolve(here, 'fixtures/joongna-search.html'), 'utf-8')

  test('RSC 조각이 나뉘어 있어도 이어붙여 읽는다', () => {
    // 실제 페이지는 self.__next_f.push() 를 여러 번 호출한다.
    // 조각 하나만 보면 JSON 이 중간에서 잘린다.
    const payload = readNextFlightPayload(jnFixture)
    assert.ok(payload.includes('"items":['))
    assert.ok(payload.includes('"totalSize"'))
  })

  test('매물을 뽑는다', () => {
    const rows = parseJoongnaHtml(jnFixture)
    assert.ok(rows.length > 0)
    const first = rows[0]!
    assert.equal(first.source, 'joongna')
    assert.ok(first.title.length > 0)
    assert.ok(first.price > 0)
    assert.match(first.url, /^https:\/\/web\.joongna\.com\/product\/\d+$/)
    assert.ok(first.sourceItemId.length > 0)
  })

  test('썸네일 필드와 매물 링크를 혼동하지 않는다', () => {
    // 응답의 `url` 필드는 이미지 주소다. 매물 링크는 seq 로 만들어야 한다.
    const rows = parseJoongnaHtml(jnFixture)
    for (const r of rows) {
      assert.ok(!r.url.includes('img2.joongna.com'), `매물 링크가 이미지 주소다: ${r.url}`)
      if (r.thumbnailUrl) assert.ok(r.thumbnailUrl.includes('img'), '썸네일이 이미지가 아니다')
    }
  })

  test('등록 시각을 한국시간으로 읽는다', () => {
    const rows = parseJoongnaHtml(jnFixture)
    const withDate = rows.find((r) => r.postedAt)
    assert.ok(withDate, '등록 시각이 하나도 없다')
    // KST 로 해석하지 않으면 9시간 어긋나 "9시간 뒤"가 되어버린다
    assert.ok(withDate!.postedAt!.getTime() <= Date.now() + 60_000, '미래 시각으로 파싱됐다')
  })

  test('전국 지역명이 붙는다', () => {
    const rows = parseJoongnaHtml(jnFixture)
    assert.ok(rows.some((r) => (r.region ?? '').length > 2))
  })

  test('판매자 ID 가 붙는다', () => {
    assert.ok(parseJoongnaHtml(jnFixture).some((r) => r.sellerId))
  })

  test('깨진 HTML 에도 터지지 않는다', () => {
    assert.deepEqual(parseJoongnaHtml('<html></html>'), [])
    assert.deepEqual(parseJoongnaHtml('<script>self.__next_f.push([1,"{\\"items\\":[oops"])</script>'), [])
  })
})

describe('헬로마켓 파서', () => {
  const hmFixture = readFileSync(resolve(here, 'fixtures/hellomarket-search.html'), 'utf-8')

  test('__NEXT_DATA__ 를 읽는다', () => {
    const data = readNextDataJson<{ props?: unknown }>(hmFixture)
    assert.ok(data?.props, '__NEXT_DATA__ 파싱 실패')
  })

  test('매물을 뽑는다', () => {
    const rows = parseHellomarketHtml(hmFixture)
    assert.ok(rows.length > 0)
    const first = rows[0]!
    assert.equal(first.source, 'hellomarket')
    assert.ok(first.title.length > 0)
    assert.ok(first.price > 0)
    assert.match(first.url, /^https:\/\/www\.hellomarket\.com\/item\/\d+$/)
  })

  test('epoch 밀리초 타임스탬프를 읽는다', () => {
    const rows = parseHellomarketHtml(hmFixture)
    const withDate = rows.find((r) => r.postedAt)
    assert.ok(withDate, '등록 시각이 하나도 없다')
    const t = withDate!.postedAt!.getTime()
    // 초 단위로 잘못 읽으면 1970년대가 된다
    assert.ok(t > Date.parse('2020-01-01'), `시각이 너무 과거다: ${withDate!.postedAt!.toISOString()}`)
    assert.ok(t <= Date.now() + 60_000, '미래 시각으로 파싱됐다')
  })

  test('지역을 주지 않는 소스이므로 지어내지 않는다', () => {
    for (const r of parseHellomarketHtml(hmFixture)) {
      assert.equal(r.region, undefined)
    }
  })

  test('매물 링크와 썸네일을 혼동하지 않는다', () => {
    // 헬로마켓 이미지 경로에도 /item/ 이 들어가므로 호스트로 구분해야 한다
    for (const r of parseHellomarketHtml(hmFixture)) {
      assert.equal(new URL(r.url).host, 'www.hellomarket.com')
      if (r.thumbnailUrl) {
        assert.notEqual(new URL(r.thumbnailUrl).host, 'www.hellomarket.com')
        assert.match(r.thumbnailUrl, /\.(jpg|jpeg|png|webp|gif)/i)
      }
    }
  })

  test('깨진 HTML 에도 터지지 않는다', () => {
    assert.deepEqual(parseHellomarketHtml('<html></html>'), [])
    assert.deepEqual(
      parseHellomarketHtml('<script id="__NEXT_DATA__" type="application/json">{oops</script>'),
      [],
    )
  })
})

describe('어댑터 레지스트리', () => {
  test('국내 4곳 + 해외 2곳이 등록되어 있다', () => {
    const ids = allAdapters().map((a) => a.id).sort()
    assert.deepEqual(ids, [
      'bunjang', 'daangn', 'hellomarket', 'joongna', 'mercari', 'yahoo_auction',
    ])
  })

  test('환경변수로 소스를 즉시 끌 수 있다', () => {
    const saved = process.env.DISABLED_SOURCES
    process.env.DISABLED_SOURCES = 'joongna,hellomarket'
    try {
      const ids = activeAdapters().map((a) => a.id)
      assert.ok(!ids.includes('joongna'))
      assert.ok(!ids.includes('hellomarket'))
      assert.ok(ids.includes('bunjang'))
    } finally {
      if (saved === undefined) delete process.env.DISABLED_SOURCES
      else process.env.DISABLED_SOURCES = saved
    }
  })

  test('모든 어댑터가 고유 id 와 라벨을 갖는다', () => {
    const all = allAdapters()
    assert.equal(new Set(all.map((a) => a.id)).size, all.length)
    assert.ok(all.every((a) => a.label.length > 0))
  })
})

describe('타임아웃은 기다림이 아니라 요청을 끊는다', () => {
  test('제한 시간이 지나면 어댑터에 취소 신호가 전달된다', async () => {
    let sawAbort = false
    const slow: SourceAdapter = {
      id: 'bunjang', label: 'slow', enabled: true,
      async search(_kw, opts) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 3000)
          opts?.signal?.addEventListener('abort', () => {
            sawAbort = true
            clearTimeout(t)
            resolve()
          })
        })
        return []
      },
    }
    await federate('테스트', { adapters: [slow], timeoutMs: 100 })
    // 취소가 실제로 전파되지 않으면 죽은 요청이 호스트 큐를 계속 붙잡는다
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(sawAbort, true, '타임아웃이 어댑터를 끊지 않았다')
  })

  test('느린 소스가 다음 검색까지 밀지 않는다', async () => {
    const slow: SourceAdapter = {
      id: 'daangn', label: 'slow', enabled: true,
      async search(_kw, opts) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 5000)
          opts?.signal?.addEventListener('abort', () => { clearTimeout(t); resolve() })
        })
        return []
      },
    }
    const fast: SourceAdapter = {
      id: 'bunjang', label: 'fast', enabled: true,
      async search() {
        return [{ source: 'bunjang' as const, sourceItemId: '1', title: 'x', price: 1000, url: 'https://x/1' }]
      },
    }
    const t0 = Date.now()
    await federate('첫번째', { adapters: [slow, fast], timeoutMs: 120 })
    await federate('두번째', { adapters: [slow, fast], timeoutMs: 120 })
    const elapsed = Date.now() - t0
    assert.ok(elapsed < 2000, `두 번의 검색에 ${elapsed}ms 걸렸다 — 죽은 요청이 큐를 붙잡고 있다`)
  })
})

describe('야후옥션 파서', () => {
  const yaFixture = readFileSync(resolve(here, 'fixtures/yahoo-search.html'), 'utf-8')

  test('매물을 뽑는다', () => {
    const rows = parseYahooHtml(yaFixture)
    assert.ok(rows.length > 0)
    const first = rows[0]!
    assert.equal(first.source, 'yahoo_auction')
    assert.equal(first.currency, 'JPY', '엔화 표시가 빠지면 원화로 오인된다')
    assert.match(first.url, /^https:\/\/page\.auctions\.yahoo\.co\.jp\/jp\/auction\/[a-z]\d+$/)
    assert.ok(first.price > 0)
  })

  test('경매와 정가 판매를 구분한다', () => {
    // 경매의 price 는 "현재 입찰가"라 확정 가격이 아니다. 화면에서 반드시 구분해야 한다.
    const rows = parseYahooHtml(yaFixture)
    assert.ok(rows.every((r) => r.listingType === 'auction' || r.listingType === 'fixed'))
  })

  test('배송비를 즉시구매가로 착각하지 않는다', () => {
    // cl-params 의 cpsf 는 送料(배송비)다. 즉시구매가로 읽으면 현재가보다 싼 "즉결가"가 나온다.
    const rows = parseYahooHtml(yaFixture)
    for (const r of rows) {
      if (r.shippingFee !== undefined) {
        assert.ok(r.shippingFee > 0 && r.shippingFee < 100_000, `배송비가 이상하다: ${r.shippingFee}`)
      }
    }
  })

  test('시작·마감 시각을 읽는다', () => {
    const rows = parseYahooHtml(yaFixture)
    const withEnd = rows.find((r) => r.endsAt)
    assert.ok(withEnd, '마감 시각이 하나도 없다')
    assert.ok(withEnd!.endsAt! > withEnd!.postedAt!, '마감이 시작보다 앞선다')
  })

  test('HTML 엔티티를 되돌린다', () => {
    for (const r of parseYahooHtml(yaFixture)) {
      assert.ok(!r.title.includes('&amp;'), `제목에 엔티티가 남았다: ${r.title}`)
    }
  })

  test('깨진 HTML 에도 터지지 않는다', () => {
    assert.deepEqual(parseYahooHtml('<html></html>'), [])
  })
})

describe('시장 구분', () => {
  test('국내 소스만 고를 수 있다', () => {
    const ids = allAdapters('domestic').map((a) => a.id)
    assert.ok(ids.includes('bunjang'))
    assert.ok(!ids.includes('yahoo_auction'))
  })
  test('해외 소스만 고를 수 있다', () => {
    const ids = allAdapters('overseas').map((a) => a.id)
    assert.deepEqual(ids.sort(), ['mercari', 'yahoo_auction'])
  })
  test('연합검색이 시장 밖 소스를 부르지 않는다', async () => {
    const r = await federate('테스트', { scope: 'overseas', timeoutMs: 100 })
    assert.ok(r.statuses.every((s) => ['yahoo_auction', 'mercari'].includes(s.source)))
  })
  test('메루카리는 실시간 조회를 하지 않는다 — 수집 전용 소스다', async () => {
    const { mercariAdapter } = await import('../src/adapters/mercari.js')
    assert.equal(mercariAdapter.enabled, false)
    assert.deepEqual(await mercariAdapter.search('x'), [])
    assert.ok(mercariAdapter.disabledReason)
  })
})

describe('실패한 검색은 캐시하지 않는다', () => {
  test('모든 소스가 죽으면 캐시에 남기지 않는다', async () => {
    // 실패를 캐시하면 소스가 복구돼도 10분간 열화된 결과를 계속 보여주게 된다
    const { search } = await import('../src/service.js')
    const { getCachedSearch, cacheKey, clearMemoryCache } = await import('@eodi/db')
    clearMemoryCache()

    const broken: SourceAdapter = {
      id: 'bunjang', label: 'broken', enabled: true,
      async search() { throw new Error('일시 장애') },
    }
    const term = `캐시테스트${Date.now()}`
    await search({ q: term }, { federate: { adapters: [broken], timeoutMs: 200 }, persist: true })

    const hit = await getCachedSearch(cacheKey(term, { v: 4, r: '', s: 'domestic' }))
    assert.equal(hit, null, '실패한 결과가 캐시에 남았다')
  })
})

describe('파서 견고성', () => {
  test('키와 대괄호 사이 공백을 견딘다', () => {
    // 상대가 직렬화기를 바꿔 `"key": [` 로 나와도 조용히 0건이 되면 안 된다
    assert.equal(extractJsonArray('{"items": [1,2]}', 'items'), '[1,2]')
    assert.equal(extractJsonArray('{"items"\n:\t[3]}', 'items'), '[3]')
    assert.equal(extractJsonArray('{"items":[4]}', 'items'), '[4]')
  })
  test('비슷한 이름의 다른 키에 걸리지 않는다', () => {
    assert.equal(extractJsonArray('{"itemsCount":[9],"items":[1]}', 'items'), '[1]')
  })
})
