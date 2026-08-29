import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ProductMatcher } from '../src/catalog.js'
import { CATALOG } from '../src/catalog.data.js'
import { interpretQuery, extractPriceCondition } from '../src/query.js'
import { trigrams, jaccard, mergeDuplicates } from '../src/dedupe.js'
import { relevanceScore, freshnessScore, rank, diversify } from '../src/rank.js'
import { applyFilters, computeFacets, visibleKinds } from '../src/filter.js'
import { buildSearchResult, mergeFilters } from '../src/search.js'
import { enrichAll } from '../src/enrich.js'
import type { RawListing } from '../src/types.js'

const m = new ProductMatcher(CATALOG)
const NOW = new Date('2026-08-29T00:00:00Z')

let seq = 0
const L = (o: Partial<RawListing> & { title: string; price: number }): RawListing => ({
  source: 'bunjang',
  sourceItemId: `x${++seq}`,
  url: 'https://example.test/x',
  ...o,
})

describe('질의 해석', () => {
  test('가격 상한을 읽는다', () => {
    const p = extractPriceCondition('아이폰16 100만원 이하')
    assert.equal(p.maxPrice, 1_000_000)
  })
  test('가격 하한을 읽는다', () => {
    assert.equal(extractPriceCondition('맥북 50만원 이상').minPrice, 500_000)
  })
  test('구간을 읽는다', () => {
    const p = extractPriceCondition('에어팟 10만~20만')
    assert.equal(p.minPrice, 100_000)
    assert.equal(p.maxPrice, 200_000)
  })
  test('원 단위 숫자도 읽는다', () => {
    assert.equal(extractPriceCondition('닌텐도 스위치 250000원 이하').maxPrice, 250_000)
  })
  test('가격 표현은 마켓에 보낼 검색어에서 빠진다', () => {
    const q = interpretQuery('아이폰16 프로 100만원 이하', m)
    assert.equal(q.maxPrice, 1_000_000)
    assert.ok(!q.searchTerm.includes('이하'))
    assert.ok(q.searchTerm.includes('아이폰'))
  })
  test('모델과 용량을 인식한다', () => {
    const q = interpretQuery('아이폰16프로 256기가', m)
    assert.equal(q.productId, 'iphone-16-pro')
    assert.equal(q.productName, '아이폰 16 Pro')
    assert.equal(q.category, 'smartphone')
    assert.equal(q.storageGb, 256)
  })
  test('카탈로그에 없는 검색어도 그대로 통과시킨다', () => {
    const q = interpretQuery('한샘 4인용 식탁', m)
    assert.equal(q.productId, null)
    assert.equal(q.searchTerm, '한샘 4인용 식탁')
    assert.ok(q.tokens.length >= 3)
  })
})

describe('유사도', () => {
  test('3-gram 자카드', () => {
    assert.equal(jaccard(trigrams('아이폰16프로'), trigrams('아이폰16프로')), 1)
    assert.ok(jaccard(trigrams('아이폰16프로 256'), trigrams('아이폰 16 프로 256gb')) > 0.4)
    assert.ok(jaccard(trigrams('아이폰16프로'), trigrams('닌텐도 스위치')) < 0.1)
  })
})

describe('교차 마켓 중복 병합', () => {
  test('다른 마켓의 같은 매물을 하나로 묶는다', () => {
    const raws = [
      L({ source: 'bunjang', title: '아이폰16 프로 256GB 자급제 팝니다', price: 1_100_000, postedAt: NOW }),
      L({ source: 'daangn', title: '아이폰16 프로 256gb 자급제 팝니다', price: 1_100_000, postedAt: NOW }),
    ]
    const merged = mergeDuplicates(enrichAll(raws, m))
    assert.equal(merged.length, 1)
    assert.deepEqual(new Set(merged[0]!.sources), new Set(['bunjang', 'daangn']))
    assert.equal(merged[0]!.duplicates.length, 1)
  })

  test('가격이 크게 다르면 합치지 않는다', () => {
    const raws = [
      L({ source: 'bunjang', title: '아이폰16 프로 256GB 팝니다', price: 1_100_000, postedAt: NOW }),
      L({ source: 'daangn', title: '아이폰16 프로 256GB 팝니다', price: 1_300_000, postedAt: NOW }),
    ]
    assert.equal(mergeDuplicates(enrichAll(raws, m)).length, 2)
  })

  test('용량이 다르면 합치지 않는다', () => {
    const raws = [
      L({ source: 'bunjang', title: '아이폰16 프로 128GB 팝니다', price: 1_100_000, postedAt: NOW }),
      L({ source: 'daangn', title: '아이폰16 프로 256GB 팝니다', price: 1_100_000, postedAt: NOW }),
    ]
    assert.equal(mergeDuplicates(enrichAll(raws, m)).length, 2)
  })

  test('다른 제품이면 제목이 비슷해도 합치지 않는다', () => {
    const raws = [
      L({ source: 'bunjang', title: '아이폰16 프로 팝니다', price: 1_100_000, postedAt: NOW }),
      L({ source: 'daangn', title: '아이폰16 프로 맥스 팝니다', price: 1_100_000, postedAt: NOW }),
    ]
    assert.equal(mergeDuplicates(enrichAll(raws, m)).length, 2)
  })

  test('같은 마켓 재등록은 더 엄격한 기준으로만 합친다', () => {
    const raws = [
      L({ source: 'bunjang', sourceItemId: 'a', title: '아이폰16 프로 256GB 자급제', price: 1_100_000, postedAt: NOW }),
      L({ source: 'bunjang', sourceItemId: 'b', title: '아이폰16 프로 256GB 자급제', price: 1_100_000, postedAt: NOW }),
      L({ source: 'bunjang', sourceItemId: 'c', title: '아이폰16 프로 256GB 급처 상태좋음 박스포함', price: 1_100_000, postedAt: NOW }),
    ]
    const merged = mergeDuplicates(enrichAll(raws, m))
    assert.equal(merged.length, 2)
  })

  test('대표는 정보가 더 충실한 쪽이 된다', () => {
    const raws = [
      L({ source: 'bunjang', title: '아이폰16 프로 256GB 팝니다', price: 1_100_000 }),
      L({ source: 'daangn', title: '아이폰16 프로 256GB 팝니다', price: 1_100_000, postedAt: NOW, region: '서울 강남구', thumbnailUrl: 'https://t/1.jpg' }),
    ]
    const merged = mergeDuplicates(enrichAll(raws, m))
    assert.equal(merged.length, 1)
    assert.equal(merged[0]!.source, 'daangn')
  })
})

describe('랭킹', () => {
  const q = interpretQuery('아이폰16 프로', m)
  test('질의어가 앞에 많이 나올수록 높다', () => {
    const a = relevanceScore('아이폰16 프로 256GB', q)
    const b = relevanceScore('삼성 충전기 아이폰 겸용 프로텍터', q)
    assert.ok(a > b, `${a} > ${b}`)
  })
  test('관련 없는 제목은 0', () => {
    assert.equal(relevanceScore('한샘 식탁 4인용', interpretQuery('닌텐도 스위치', m)), 0)
  })
  test('신선도는 시간이 지날수록 감쇠한다', () => {
    const fresh = freshnessScore(new Date('2026-08-28T00:00:00Z'), NOW)
    const old = freshnessScore(new Date('2026-06-01T00:00:00Z'), NOW)
    assert.ok(fresh > old)
    assert.ok(fresh <= 1 && old >= 0)
  })
  test('매입글은 노출되더라도 아래로 내려간다', () => {
    const raws = [
      L({ title: '아이폰16 프로 매입합니다', price: 1_000_000, postedAt: NOW }),
      L({ title: '아이폰16 프로 256GB 팝니다', price: 1_000_000, postedAt: NOW }),
    ]
    const ranked = rank(mergeDuplicates(enrichAll(raws, m)), q, 'relevance', NOW)
    assert.equal(ranked[0]!.kind, 'item')
    assert.equal(ranked[1]!.kind, 'wanted')
  })
  test('정렬 기준이 바뀌면 순서도 바뀐다', () => {
    const raws = [
      L({ title: '아이폰16 프로 256GB A', price: 1_300_000, postedAt: new Date('2026-08-01') }),
      L({ title: '아이폰16 프로 256GB B', price: 900_000, postedAt: new Date('2026-08-28') }),
    ]
    const merged = mergeDuplicates(enrichAll(raws, m))
    assert.equal(rank(merged, q, 'price_asc', NOW)[0]!.price, 900_000)
    assert.equal(rank(merged, q, 'price_desc', NOW)[0]!.price, 1_300_000)
    assert.ok(rank(merged, q, 'recent', NOW)[0]!.title.endsWith('B'))
  })
})

describe('필터와 패싯', () => {
  const raws = [
    L({ source: 'bunjang', title: '아이폰16 프로 256GB', price: 1_100_000, region: '서울특별시 강남구 역삼동', postedAt: NOW }),
    L({ source: 'daangn', title: '아이폰16 프로 128GB 급처', price: 900_000, region: '경기도 성남시 분당구', postedAt: NOW }),
    L({ source: 'bunjang', title: '아이폰16 프로 케이스', price: 12_000, postedAt: NOW }),
    L({ source: 'bunjang', title: '아이폰16 프로 매입합니다', price: 1_000_000, postedAt: NOW }),
    L({ source: 'daangn', title: '아이폰16 프로 256GB 판매완료', price: 1_050_000, sold: true, postedAt: NOW }),
  ]
  const merged = mergeDuplicates(enrichAll(raws, m))

  test('기본 노출: 매입글과 판매완료는 감춘다', () => {
    const out = applyFilters(merged, undefined, NOW)
    assert.ok(!out.some((l) => l.kind === 'wanted'))
    assert.ok(!out.some((l) => l.sold))
    assert.ok(out.some((l) => l.kind === 'accessory'))
  })
  test('종류 필터를 켜면 매입글도 볼 수 있다', () => {
    const out = applyFilters(merged, { kinds: ['wanted'] }, NOW)
    assert.equal(out.length, 1)
    assert.equal(out[0]!.kind, 'wanted')
  })
  test('가격 범위', () => {
    const out = applyFilters(merged, { minPrice: 1_000_000 }, NOW)
    assert.ok(out.every((l) => l.price >= 1_000_000))
  })
  test('마켓 필터', () => {
    const out = applyFilters(merged, { sources: ['daangn'] }, NOW)
    assert.ok(out.every((l) => l.sources.includes('daangn')))
  })
  test('지역 필터', () => {
    assert.equal(applyFilters(merged, { region: '강남' }, NOW).length, 1)
  })
  test('판매완료 포함', () => {
    assert.ok(applyFilters(merged, { includeSold: true }, NOW).some((l) => l.sold))
  })
  test('기본 노출 종류', () => {
    assert.deepEqual(visibleKinds(), ['item', 'accessory', 'media', 'parts', 'bulk'])
  })
  test('패싯은 자기 축을 제외한 필터로 센다 — 되돌릴 수 있어야 하므로', () => {
    const f = computeFacets(merged, { sources: ['daangn'] }, NOW)
    const bunjang = f.sources.find((s) => s.id === 'bunjang')
    assert.ok(bunjang && bunjang.count > 0, '번개장터 개수가 0이면 필터를 되돌릴 수 없다')
  })
  test('지역 패싯은 시·구 수준으로 묶는다', () => {
    const f = computeFacets(merged, undefined, NOW)
    assert.ok(f.regions.some((r) => r.name === '서울특별시 강남구'))
  })
})

describe('검색 결과 조립', () => {
  test('질의 가격조건이 필터로 들어간다', () => {
    const q = interpretQuery('아이폰16 프로 100만원 이하', m)
    assert.equal(mergeFilters(q).maxPrice, 1_000_000)
  })
  test('UI 필터가 질의 조건보다 우선한다', () => {
    const q = interpretQuery('아이폰16 프로 100만원 이하', m)
    assert.equal(mergeFilters(q, { maxPrice: 500_000 }).maxPrice, 500_000)
  })
  test('전체 파이프라인', () => {
    const raws = [
      L({ source: 'bunjang', title: '아이폰16 프로 256GB 자급제', price: 1_100_000, postedAt: NOW }),
      L({ source: 'daangn', title: '아이폰16 프로 256gb 자급제', price: 1_100_000, postedAt: NOW }),
      L({ source: 'bunjang', title: '아이폰16 프로 매입', price: 1_000_000, postedAt: NOW }),
      L({ source: 'bunjang', title: '아이폰16 프로 케이스', price: 9_900, postedAt: NOW }),
    ]
    const q = interpretQuery('아이폰16 프로', m)
    const r = buildSearchResult({ interpreted: q, listings: raws, matcher: m, now: NOW })
    // 중복 2건 병합 → 3장, 그중 매입글은 기본 숨김 → 2장
    assert.equal(r.total, 2)
    assert.equal(r.items[0]!.sources.length, 2)
    assert.equal(r.enriched.length, 4)
    assert.ok(r.facets.kinds.some((k) => k.id === 'wanted'))
  })
  test('페이지네이션', () => {
    const raws = Array.from({ length: 30 }, (_, i) =>
      L({ title: `아이폰16 프로 256GB 매물 ${i}`, price: 1_000_000 + i * 1000, postedAt: NOW }),
    )
    const q = interpretQuery('아이폰16 프로', m)
    const p1 = buildSearchResult({ interpreted: q, listings: raws, matcher: m, perPage: 24, page: 1, now: NOW })
    const p2 = buildSearchResult({ interpreted: q, listings: raws, matcher: m, perPage: 24, page: 2, now: NOW })
    assert.equal(p1.items.length, 24)
    assert.equal(p2.items.length, 6)
    assert.equal(p1.total, 30)
  })
  test('결과가 없어도 터지지 않는다', () => {
    const q = interpretQuery('존재하지않는물건', m)
    const r = buildSearchResult({ interpreted: q, listings: [], matcher: m, now: NOW })
    assert.equal(r.total, 0)
    assert.equal(r.items.length, 0)
  })
})

describe('가격 이상 표시', () => {
  test('나눔(0원)은 경고가 아니라 라벨이다', () => {
    const [l] = enrichAll([L({ title: '아이폰16 프로 나눔', price: 0 })], m)
    assert.equal(l!.priceFlag, 'free')
  })
  test('출시가 대비 말이 안 되는 저가는 표시한다', () => {
    const [l] = enrichAll([L({ title: '아이폰 16 프로 1TB 화이트 티타늄', price: 133 })], m)
    assert.equal(l!.priceFlag, 'too-low')
  })
  test('정상 가격은 표시하지 않는다', () => {
    const [l] = enrichAll([L({ title: '아이폰16 프로 256GB', price: 1_050_000 })], m)
    assert.equal(l!.priceFlag, null)
  })
  test('액세서리는 싸도 정상이다', () => {
    const [l] = enrichAll([L({ title: '아이폰16 프로 케이스', price: 3_000 })], m)
    assert.equal(l!.kind, 'accessory')
    assert.equal(l!.priceFlag, null)
  })
  test('이상 가격은 순위가 내려간다', () => {
    const q = interpretQuery('아이폰16 프로', m)
    const raws = [
      L({ title: '아이폰 16 프로 256GB 화이트', price: 133, postedAt: NOW }),
      L({ title: '아이폰 16 프로 256GB 블랙', price: 1_050_000, postedAt: NOW }),
    ]
    const ranked = rank(mergeDuplicates(enrichAll(raws, m)), q, 'relevance', NOW)
    assert.equal(ranked[0]!.price, 1_050_000)
  })
})

describe('결과 다양성', () => {
  test('한 마켓이 첫 화면을 독점하지 못한다', () => {
    const q = interpretQuery('아이폰16 프로', m)
    const raws = [
      ...Array.from({ length: 8 }, (_, i) =>
        L({ source: 'bunjang', title: `아이폰16 프로 256GB 매물${i}`, price: 1_000_000 + i * 5000, postedAt: NOW }),
      ),
      L({ source: 'daangn', title: '아이폰16 프로 256GB 당근매물', price: 990_000, postedAt: NOW }),
    ]
    const ranked = rank(mergeDuplicates(enrichAll(raws, m)), q, 'relevance', NOW)
    const top4 = ranked.slice(0, 4).map((l) => l.source)
    assert.ok(top4.includes('daangn'), `상위 4건에 당근이 없다: ${top4.join(',')}`)
  })

  test('같은 판매자가 목록을 도배하지 못한다', () => {
    const q = interpretQuery('아이폰16 프로', m)
    const raws = [
      ...Array.from({ length: 6 }, (_, i) =>
        L({ source: 'bunjang', sellerId: 'shop1', proSeller: true, title: `아이폰16 프로 256GB 특가${i}`, price: 900_000 + i * 1000, postedAt: NOW }),
      ),
      L({ source: 'bunjang', sellerId: 'person1', title: '아이폰16 프로 256GB 개인판매', price: 950_000, postedAt: NOW }),
    ]
    const ranked = rank(mergeDuplicates(enrichAll(raws, m)), q, 'relevance', NOW)
    const top3 = ranked.slice(0, 3).map((l) => l.sellerId)
    assert.ok(top3.includes('person1'), `상위 3건이 전부 같은 판매자다: ${top3.join(',')}`)
  })

  test('정렬이 가격순이면 다양성 재배열을 하지 않는다', () => {
    const q = interpretQuery('아이폰16 프로', m)
    const raws = [
      L({ source: 'bunjang', title: '아이폰16 프로 A', price: 800_000, postedAt: NOW }),
      L({ source: 'bunjang', title: '아이폰16 프로 B', price: 810_000, postedAt: NOW }),
      L({ source: 'daangn', title: '아이폰16 프로 C', price: 900_000, postedAt: NOW }),
    ]
    const ranked = rank(mergeDuplicates(enrichAll(raws, m)), q, 'price_asc', NOW)
    assert.deepEqual(ranked.map((l) => l.price), [800_000, 810_000, 900_000])
  })
})

describe('게임 타이틀 구분', () => {
  test('게임기 검색에서 타이틀은 따로 라벨링된다', () => {
    const raws = [
      L({ title: '닌텐도 스위치2 마리오카트월드 게임 미개봉 새상품', price: 80_000 }),
      L({ title: '닌텐도 스위치 2 본체 풀박스', price: 620_000 }),
    ]
    const [game, body] = enrichAll(raws, m)
    assert.equal(game!.kind, 'media')
    assert.equal(body!.kind, 'item')
  })
  test('본체 구성 표기가 있으면 타이틀이 섞여도 본품이다', () => {
    const [l] = enrichAll([L({ title: '닌텐도 스위치2 풀박스 + 악세서리 + 타이틀 칩 13개', price: 1_140_000 })], m)
    assert.equal(l!.kind, 'item')
  })
  test('게임기가 아닌 카테고리에는 적용하지 않는다', () => {
    const [l] = enrichAll([L({ title: '아이폰16 프로 256GB 게임 잘 돌아감', price: 1_000_000 })], m)
    assert.equal(l!.kind, 'item')
  })
  test('본체 가격으로 보기 어려운 저가는 표시된다', () => {
    const [l] = enrichAll([L({ title: '닌텐도스위치2 브래이블리 디폴트 미개봉', price: 32_000 })], m)
    assert.equal(l!.priceFlag, 'too-low')
  })
})

describe('게임 타이틀 표기 단서', () => {
  const cases: Array<[string, string]> = [
    ['닌텐도 스위치 슈퍼로봇대전 Y 초한정판 미개봉', 'media'],
    ['한글판 닌텐도 스위치 레이튼 미스터리 저니 DX', 'media'],
    ['닌텐도 스위치 배터리 개선판 본체 풀박스', 'item'],
    ['닌텐도 스위치 동물의 숲 에디션 풀박스 (+추가 조이콘)', 'item'],
    ['PS5 슬림 디스크 에디션', 'item'],
  ]
  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      const [l] = enrichAll([L({ title, price: 300_000 })], m)
      assert.equal(l!.kind, expected)
    })
  }
})
