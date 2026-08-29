import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryTtlMap, MemoryCounter } from '../src/memory.js'
import { cacheKey } from '../src/cache.js'
import { hasDb } from '../src/client.js'

describe('메모리 캐시 (DB 없을 때의 대체 저장소)', () => {
  test('넣고 뺀다', () => {
    const m = new MemoryTtlMap<number>(10)
    m.set('a', 1, 1000)
    assert.equal(m.get('a'), 1)
    assert.equal(m.get('없음'), null)
  })

  test('만료되면 사라진다', async () => {
    const m = new MemoryTtlMap<number>(10)
    m.set('a', 1, 10)
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(m.get('a'), null)
    assert.equal(m.size, 0)
  })

  test('용량을 넘으면 가장 오래된 것부터 버린다', () => {
    const m = new MemoryTtlMap<number>(3)
    m.set('a', 1, 10_000)
    m.set('b', 2, 10_000)
    m.set('c', 3, 10_000)
    m.get('a') // a 를 최근 사용으로 올린다
    m.set('d', 4, 10_000)
    assert.equal(m.get('b'), null, '가장 오래 안 쓴 b 가 밀려났어야 한다')
    assert.equal(m.get('a'), 1)
    assert.equal(m.get('d'), 4)
  })

  test('clear', () => {
    const m = new MemoryTtlMap<number>(3)
    m.set('a', 1, 1000)
    m.clear()
    assert.equal(m.size, 0)
  })
})

describe('인기 검색어 카운터', () => {
  test('많이 찾은 순으로 준다', () => {
    const c = new MemoryCounter()
    c.add('아이폰16', '아이폰16')
    c.add('아이폰16', '아이폰16')
    c.add('자전거', '자전거')
    const top = c.top(5)
    assert.equal(top[0]?.term, '아이폰16')
    assert.equal(top[0]?.count, 2)
    assert.equal(top.length, 2)
  })

  test('limit 을 지킨다', () => {
    const c = new MemoryCounter()
    for (let i = 0; i < 10; i++) c.add(`q${i}`, `q${i}`)
    assert.equal(c.top(3).length, 3)
  })
})

describe('캐시 키', () => {
  test('같은 검색어는 같은 키', () => {
    assert.equal(cacheKey('아이폰16'), cacheKey('아이폰16'))
    assert.equal(cacheKey(' 아이폰16 '), cacheKey('아이폰16'), '앞뒤 공백은 무시한다')
    assert.equal(cacheKey('IPHONE16'), cacheKey('iphone16'), '대소문자는 무시한다')
  })
  test('다른 검색어는 다른 키', () => {
    assert.notEqual(cacheKey('아이폰16'), cacheKey('아이폰17'))
  })
  test('부가 조건이 다르면 다른 키', () => {
    assert.notEqual(cacheKey('아이폰16', { r: 'a' }), cacheKey('아이폰16', { r: 'b' }))
  })
})

describe('DB 없이도 동작한다', () => {
  test('DATABASE_URL 이 없으면 hasDb 는 false', () => {
    const saved = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    assert.equal(hasDb(), false)
    if (saved) process.env.DATABASE_URL = saved
  })
})

describe('캐시 직렬화', () => {
  test('모든 날짜 필드가 Date 로 되살아난다', async () => {
    const { setCachedSearch, getCachedSearch, cacheKey: mk, clearMemoryCache } = await import('../src/cache.js')
    clearMemoryCache()
    const key = mk('테스트-리바이브')
    await setCachedSearch(key, '테스트', [
      {
        source: 'yahoo_auction',
        sourceItemId: 'x1',
        title: 'ねんどろいど',
        price: 2500,
        currency: 'JPY',
        url: 'https://x/1',
        // JSON 을 거치면 문자열이 된다
        postedAt: new Date('2026-08-28T00:00:00Z'),
        endsAt: new Date('2026-08-31T00:00:00Z'),
      },
    ], [])
    clearMemoryCache() // 메모리 캐시를 비워 직렬화 경로를 강제한다
    const hit = await getCachedSearch(key)
    // DB 가 없으면 메모리 캐시만 쓰므로 이 경로는 DB 있을 때만 검증된다
    if (!hit) return
    const l = hit.listings[0]!
    assert.ok(l.postedAt instanceof Date, 'postedAt 이 Date 가 아니다')
    assert.ok(l.endsAt instanceof Date, 'endsAt 이 Date 가 아니다 — 새 날짜 필드를 빠뜨렸다')
  })
})
