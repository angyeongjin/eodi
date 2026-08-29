import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { diffAlert, buildNotification, describeAlert, listingKey, SEEN_CAP } from '../src/alerts.js'
import type { AlertRule } from '../src/alerts.js'
import { enrichAll } from '../src/enrich.js'
import { mergeDuplicates } from '../src/dedupe.js'
import { ProductMatcher } from '../src/catalog.js'
import { CATALOG } from '../src/catalog.data.js'
import type { MergedListing, RawListing } from '../src/types.js'

const m = new ProductMatcher(CATALOG)
const items = (rows: Array<Partial<RawListing> & { title: string; price: number; sourceItemId: string }>): MergedListing[] =>
  mergeDuplicates(
    enrichAll(
      rows.map((r) => ({ source: 'bunjang' as const, url: 'https://x/1', ...r })),
      m,
    ),
  )

const rule = (seenIds: string[] = []): AlertRule => ({
  id: 1, term: '아이폰16 프로', scope: 'domestic', filters: {}, seenIds,
})

describe('알림 — 무엇이 새 매물인가', () => {
  test('처음 등록한 알림은 아무것도 알리지 않는다', () => {
    // 등록하자마자 기존 매물 50건이 쏟아지면 그건 알림이 아니라 스팸이다
    const list = items([
      { sourceItemId: 'a', title: '아이폰16 프로 256', price: 1_000_000 },
      { sourceItemId: 'b', title: '아이폰16 프로 128', price: 900_000 },
    ])
    const r = diffAlert(rule(), list, { firstRun: true })
    assert.equal(r.fresh.length, 0)
    assert.equal(r.nextSeenIds.length, 2, '첫 실행에도 목록은 기억해야 한다')
  })

  test('이미 알린 매물은 다시 알리지 않는다', () => {
    const list = items([
      { sourceItemId: 'a', title: '아이폰16 프로 256', price: 1_000_000 },
      { sourceItemId: 'b', title: '아이폰16 프로 128', price: 900_000 },
    ])
    const r = diffAlert(rule(['bunjang:a', 'bunjang:b']), list)
    assert.equal(r.fresh.length, 0)
  })

  test('새로 올라온 것만 골라낸다', () => {
    const list = items([
      { sourceItemId: 'a', title: '아이폰16 프로 256', price: 1_000_000 },
      { sourceItemId: 'c', title: '아이폰16 프로 512 신규', price: 1_200_000 },
    ])
    const r = diffAlert(rule(['bunjang:a']), list)
    assert.equal(r.fresh.length, 1)
    assert.equal(r.fresh[0]!.sourceItemId, 'c')
  })

  test('기억은 상한을 넘지 않는다', () => {
    const many = Array.from({ length: SEEN_CAP + 50 }, (_, i) => `bunjang:old${i}`)
    const list = items([{ sourceItemId: 'new', title: '아이폰16 프로', price: 1_000_000 }])
    const r = diffAlert(rule(many), list)
    assert.equal(r.nextSeenIds.length, SEEN_CAP)
    assert.ok(r.nextSeenIds.includes('bunjang:new'), '새 매물이 기억에서 밀려났다')
  })

  test('매물 키는 소스와 함께 만든다', () => {
    assert.equal(listingKey({ source: 'bunjang', sourceItemId: '1' }), 'bunjang:1')
    assert.notEqual(
      listingKey({ source: 'bunjang', sourceItemId: '1' }),
      listingKey({ source: 'daangn', sourceItemId: '1' }),
    )
  })
})

describe('알림 문구', () => {
  test('새 매물이 없으면 알림을 만들지 않는다', () => {
    const r = diffAlert(rule(['bunjang:a']), items([{ sourceItemId: 'a', title: '아이폰16 프로', price: 1_000_000 }]))
    assert.equal(buildNotification(r, 'https://x.test'), null)
  })

  test('가장 싼 매물을 본문에 넣는다', () => {
    const list = items([
      { sourceItemId: 'a', title: '아이폰16 프로 256 비싼거', price: 1_400_000 },
      { sourceItemId: 'b', title: '아이폰16 프로 128 싼거', price: 800_000 },
    ])
    const n = buildNotification(diffAlert(rule(), list), 'https://x.test')!
    assert.match(n.title, /새 매물 2건/)
    assert.match(n.body, /800,000원/)
    assert.match(n.body, /싼거/)
  })

  test('많으면 "외 N건"으로 묶는다', () => {
    const list = items(
      Array.from({ length: 7 }, (_, i) => ({
        sourceItemId: `x${i}`, title: `아이폰16 프로 매물${i}`, price: 1_000_000 + i * 10_000,
      })),
    )
    const n = buildNotification(diffAlert(rule(), list), 'https://x.test')!
    assert.match(n.body, /외 4건 더/)
  })

  test('엔화 매물은 원화를 함께 넣는다', () => {
    const list = mergeDuplicates(
      enrichAll(
        [{ source: 'yahoo_auction' as const, sourceItemId: 'y1', title: 'ねんどろいど', price: 3000, currency: 'JPY' as const, url: 'https://x/1' }],
        m,
      ),
    )
    const n = buildNotification(diffAlert({ ...rule(), term: '넨도로이드', scope: 'overseas' }, list), 'https://x.test')!
    assert.match(n.body, /¥3,000/)
    assert.match(n.body, /약 /)
    assert.match(n.url, /scope=overseas/)
  })

  test('같은 알림은 하나로 덮어쓴다 — 알림창이 쌓이면 사람은 전부 꺼버린다', () => {
    const list = items([{ sourceItemId: 'a', title: '아이폰16 프로', price: 1_000_000 }])
    const n = buildNotification(diffAlert(rule(), list), 'https://x.test')!
    assert.equal(n.tag, 'alert-1')
  })

  test('조건 요약', () => {
    assert.equal(describeAlert({ term: 'x', scope: 'overseas', filters: {} }), '일본')
    assert.equal(
      describeAlert({ term: 'x', scope: 'domestic', filters: { maxPrice: 500000, region: '강남구' } }),
      '국내 · 500,000원 이하 · 강남구',
    )
  })
})

describe('첫 실행 판정 — 알림을 삼키면 안 되는 순간', () => {
  test('결과가 계속 0건이다가 처음 매물이 떠도 알린다', () => {
    // seen_ids 가 비었는지로 첫 실행을 판정하면 이 케이스에서 알림이 사라진다.
    // 희귀 굿즈를 며칠 기다린 사용자가 정확히 이 순간을 위해 알림을 걸었다.
    const list = items([{ sourceItemId: 'rare', title: '아이폰16 프로 희귀', price: 1_000_000 }])
    const r = diffAlert(rule([]), list, { firstRun: false })
    assert.equal(r.fresh.length, 1, '기다리던 첫 매물을 삼켰다')
  })

  test('진짜 첫 실행에서는 기존 매물을 쏟아내지 않는다', () => {
    const list = items(
      Array.from({ length: 30 }, (_, i) => ({
        sourceItemId: `x${i}`, title: `아이폰16 프로 ${i}`, price: 1_000_000,
      })),
    )
    const r = diffAlert(rule([]), list, { firstRun: true })
    assert.equal(r.fresh.length, 0)
    assert.equal(r.nextSeenIds.length, 30)
  })
})
