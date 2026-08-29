import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseSearchParams, buildHref, toggleInList, scopeOf } from '../lib/params.js'

describe('검색 파라미터 파싱 — 신뢰할 수 없는 입력', () => {
  test('정상 입력', () => {
    const q = parseSearchParams({ q: '아이폰', src: 'daangn', min: '10000', max: '50000' })
    assert.equal(q.q, '아이폰')
    assert.deepEqual(q.filters?.sources, ['daangn'])
    assert.equal(q.filters?.minPrice, 10_000)
    assert.equal(q.filters?.maxPrice, 50_000)
  })

  test('숫자가 아닌 가격은 무시한다 — 조용한 빈 화면을 막는다', () => {
    /*
      예전에는 max=abc 가 Number('') === 0 을 거쳐 maxPrice: 0 이 되었고,
      0원 이하 매물만 남아 결과가 전부 사라졌다.
    */
    assert.equal(parseSearchParams({ q: 'x', max: 'abc' }).filters?.maxPrice, undefined)
    assert.equal(parseSearchParams({ q: 'x', min: ';DROP' }).filters?.minPrice, undefined)
    assert.equal(parseSearchParams({ q: 'x', max: '1e9' }).filters?.maxPrice, undefined)
  })

  test('음수는 양수로 둔갑하지 않는다', () => {
    assert.equal(parseSearchParams({ q: 'x', min: '-500' }).filters?.minPrice, undefined)
  })

  test('콤마가 든 숫자는 받는다', () => {
    assert.equal(parseSearchParams({ q: 'x', max: '1,200,000' }).filters?.maxPrice, 1_200_000)
  })

  test('뒤집힌 가격 구간은 바로잡는다', () => {
    const f = parseSearchParams({ q: 'x', min: '90000', max: '1000' }).filters!
    assert.equal(f.minPrice, 1000)
    assert.equal(f.maxPrice, 90_000)
  })

  test('모르는 마켓·종류는 버린다', () => {
    assert.deepEqual(parseSearchParams({ q: 'x', src: 'evil,daangn' }).filters?.sources, ['daangn'])
    assert.equal(parseSearchParams({ q: 'x', kind: 'hack' }).filters?.kinds, undefined)
  })

  test('페이지 범위를 가둔다', () => {
    assert.equal(parseSearchParams({ q: 'x', page: '999999' }).page, 50)
    assert.equal(parseSearchParams({ q: 'x', page: '-3' }).page, 1)
    assert.equal(parseSearchParams({ q: 'x', page: 'abc' }).page, 1)
  })

  test('검색어 길이를 자른다', () => {
    assert.equal(parseSearchParams({ q: 'ㄱ'.repeat(500) }).q.length, 100)
  })

  test('배열로 들어와도 첫 값만 쓴다', () => {
    assert.equal(parseSearchParams({ q: ['a', 'b'] }).q, 'a')
  })

  test('withinDays 는 상식 범위만', () => {
    assert.equal(parseSearchParams({ q: 'x', days: '7' }).filters?.withinDays, 7)
    assert.equal(parseSearchParams({ q: 'x', days: '0' }).filters?.withinDays, undefined)
    assert.equal(parseSearchParams({ q: 'x', days: '99999' }).filters?.withinDays, undefined)
  })

  test('scope 는 화이트리스트', () => {
    assert.equal(scopeOf({ scope: 'overseas' }), 'overseas')
    assert.equal(scopeOf({ scope: 'mars' }), 'domestic')
    assert.equal(scopeOf({}), 'domestic')
  })
})

describe('링크 생성', () => {
  test('조건이 바뀌면 1페이지로 돌아간다', () => {
    assert.equal(buildHref({ q: 'x', page: '5' }, { sort: 'recent' }), '/search?q=x&sort=recent')
  })
  test('page 를 명시하면 유지한다', () => {
    assert.match(buildHref({ q: 'x' }, { page: '3' }), /page=3/)
  })
  test('값을 비우면 파라미터가 빠진다', () => {
    assert.equal(buildHref({ q: 'x', src: 'daangn' }, { src: undefined }), '/search?q=x')
  })
  test('목록 토글', () => {
    assert.equal(toggleInList('a,b', 'b'), 'a')
    assert.equal(toggleInList('a', 'a'), undefined)
    assert.equal(toggleInList(undefined, 'a'), 'a')
    assert.equal(toggleInList('a', 'b'), 'a,b')
  })
})

describe('색상 필터', () => {
  test('사전에 있는 색만 받는다', () => {
    assert.deepEqual(parseSearchParams({ q: 'x', color: 'black,white' }).filters.colors, ['black', 'white'])
  })

  test('모르는 색은 무시한다 — 필터가 아니라 오타로 본다', () => {
    /*
      형태만 검사하면 color=nope 가 통과해 결과가 통째로 0건이 된다.
      max=abc 로 검색이 사라졌던 것과 같은 부류의 사고다.
    */
    assert.equal(parseSearchParams({ q: 'x', color: 'nope' }).filters.colors, undefined)
    assert.deepEqual(parseSearchParams({ q: 'x', color: 'nope,black' }).filters.colors, ['black'])
  })

  test('빈 값이면 필터를 걸지 않는다', () => {
    assert.equal(parseSearchParams({ q: 'x', color: '' }).filters.colors, undefined)
    assert.equal(parseSearchParams({ q: 'x' }).filters.colors, undefined)
  })
})
