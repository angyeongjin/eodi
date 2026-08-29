import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { logQuery, recordEvent, outboundStats, zeroResultQueries } from '../src/queries.js'

/*
  DATABASE_URL 없이 돈다. DB 가 없으면 인메모리로 떨어지므로 "셌는가"를 프로세스 안에서 확인할 수 있다.
  로컬에서 계측이 조용히 죽어 있으면 배포된 뒤에야 알게 된다 — 그 사이 유입은 이미 지나간다.
*/

describe('계측: 검색과 클릭을 나눠 센다', () => {
  beforeEach(async () => {
    // 각 테스트가 자기 검색어만 보도록 앞선 값을 흘려보낼 수는 없어서,
    // 비율이 아니라 증가분으로 확인한다.
  })

  test('클릭률은 클릭 / 검색이다', async () => {
    const before = await outboundStats(7)

    await logQuery({ term: '아이폰16', normalized: '아이폰16', resultCount: 12, tookMs: 100, cached: false })
    await logQuery({ term: '아이폰16', normalized: '아이폰16', resultCount: 12, tookMs: 90, cached: true })
    await recordEvent({ kind: 'outbound', scope: 'domestic', surface: 'search', source: 'bunjang', position: 0, normalized: '아이폰16' })

    const after = await outboundStats(7)
    assert.equal(after.searches - before.searches, 2)
    assert.equal(after.clicks - before.clicks, 1)
    assert.ok(after.ctr > 0, '클릭이 있으면 클릭률이 0 이 아니어야 한다')
  })

  test('탭을 나눠 세지 못하면 해외 탭 비중을 판단할 수 없다', async () => {
    const before = await outboundStats(7)
    const beforeOverseas = before.byScope.find((s) => s.scope === 'overseas')?.searches ?? 0

    await logQuery({
      term: '주술회전 아크릴스탠드',
      normalized: '주술회전 아크릴스탠드',
      resultCount: 30,
      tookMs: 200,
      cached: false,
      scope: 'overseas',
    })
    await recordEvent({
      kind: 'outbound',
      scope: 'overseas',
      surface: 'search',
      source: 'yahoo_auction',
      position: 1,
      normalized: '주술회전 아크릴스탠드',
    })

    const after = await outboundStats(7)
    const overseas = after.byScope.find((s) => s.scope === 'overseas')
    assert.equal((overseas?.searches ?? 0) - beforeOverseas, 1)
    assert.ok((overseas?.clicks ?? 0) >= 1)
  })

  test('scope 를 안 주면 국내 검색으로 기록된다', async () => {
    const before = await outboundStats(7)
    const beforeDomestic = before.byScope.find((s) => s.scope === 'domestic')?.searches ?? 0

    await logQuery({ term: '닌텐도 스위치', normalized: '닌텐도 스위치', resultCount: 5, tookMs: 80, cached: false })

    const after = await outboundStats(7)
    const domestic = after.byScope.find((s) => s.scope === 'domestic')?.searches ?? 0
    assert.equal(domestic - beforeDomestic, 1)
  })

  test('어느 마켓으로 보냈는지 집계된다 — 제휴 제안의 근거', async () => {
    await recordEvent({ kind: 'outbound', scope: 'domestic', surface: 'search', source: 'daangn', position: 2, normalized: '자전거' })
    const stats = await outboundStats(7)
    const daangn = stats.bySource.find((s) => s.source === 'daangn')
    assert.ok(daangn && daangn.clicks >= 1, '당근 클릭이 집계돼야 한다')
    assert.ok(daangn!.share > 0 && daangn!.share <= 1)
  })
})

describe('계측: 화면을 나눠 센다', () => {
  test('랜딩·홈 피드 클릭은 검색 클릭률의 분자에 들어가지 않는다', async () => {
    const before = await outboundStats(7)

    // 검색을 거치지 않은 클릭 두 건. 짝이 되는 검색이 없으므로 분자에 넣으면 클릭률이 부풀어 오른다.
    await recordEvent({ kind: 'outbound', scope: 'overseas', surface: 'landing', source: 'yahoo_auction', position: 0, normalized: '피규어' })
    await recordEvent({ kind: 'outbound', scope: 'domestic', surface: 'feed', source: 'bunjang', position: null, normalized: '자전거' })

    const after = await outboundStats(7)
    assert.equal(after.clicks - before.clicks, 2, '전체 클릭에는 잡힌다')
    assert.equal(after.searchClicks - before.searchClicks, 0, '검색 결과 클릭은 늘지 않는다')

    const landing = after.bySurface.find((s) => s.surface === 'landing')
    const feed = after.bySurface.find((s) => s.surface === 'feed')
    assert.ok((landing?.clicks ?? 0) >= 1 && (feed?.clicks ?? 0) >= 1, '화면별로 따로 세진다')
  })

  test('순위가 없는 클릭은 순위 집계에서 빠진다', async () => {
    const before = await outboundStats(7)
    await recordEvent({ kind: 'outbound', scope: 'domestic', surface: 'feed', source: 'daangn', position: null, normalized: '책상' })
    const after = await outboundStats(7)
    assert.equal(after.positionedClicks - before.positionedClicks, 0)
  })
})

describe('계측: 0건 검색어', () => {
  test('결과가 없던 검색어가 보강 대상으로 올라온다', async () => {
    const term = '없는말테스트꾸러미'
    await logQuery({ term, normalized: term, resultCount: 0, tookMs: 50, cached: false, scope: 'overseas' })
    await logQuery({ term, normalized: term, resultCount: 0, tookMs: 40, cached: false, scope: 'overseas' })

    const zeros = await zeroResultQueries(50, 7)
    const found = zeros.find((z) => z.term === term)
    assert.ok(found, '0건 검색어 목록에 있어야 한다')
    assert.equal(found?.scope, 'overseas')
    assert.ok((found?.count ?? 0) >= 2, '같은 말을 두 번 찾았으면 두 번으로 센다')
  })

  test('결과가 있던 검색어는 올라오지 않는다', async () => {
    const term = '결과있는말테스트'
    await logQuery({ term, normalized: term, resultCount: 7, tookMs: 60, cached: false })

    const zeros = await zeroResultQueries(50, 7)
    assert.equal(zeros.find((z) => z.term === term), undefined)
  })
})
