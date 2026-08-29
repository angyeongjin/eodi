import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ProductMatcher } from '../src/catalog.js'
import { CATALOG } from '../src/catalog.data.js'
import { classifyKind, looksSealed, KIND_DICT } from '../src/classify.js'
import { extractVariant, buildVariantKey, formatVariantKey, extractCarrier } from '../src/variant.js'
import { compact, parseKrw, tokenize, escapeJsonForHtml } from '../src/text.js'

const m = new ProductMatcher(CATALOG)
const nameOf = (title: string) => {
  const r = m.match(title)
  return r ? m.get(r.productId)?.name ?? null : null
}

describe('텍스트 정규화', () => {
  test('한/영/전각/이모지 혼용을 하나로 모은다', () => {
    assert.equal(compact('아이폰16 Pro ★급처★'), '아이폰16pro급처')
    assert.equal(compact('ＩＰＨＯＮＥ　16'), 'iphone16')
  })
  test('용량 단위를 통일한다', () => {
    assert.equal(compact('512기가'), '512gb')
    assert.equal(compact('1테라'), '1tb')
    assert.equal(compact('256 GB'), '256gb')
  })
  test('원화 표기를 숫자로 바꾼다', () => {
    assert.equal(parseKrw('125만원'), 1_250_000)
    assert.equal(parseKrw('1,250,000원'), 1_250_000)
    assert.equal(parseKrw('1억 2000만'), 120_000_000)
    assert.equal(parseKrw(''), null)
  })
  test('한글·영문·숫자 경계로 토큰을 쪼갠다', () => {
    assert.deepEqual(tokenize('갤럭시S24울트라'), ['갤럭시', 's', '24', '울트라'])
  })

  test('JSON-LD 에 박히는 문자열은 스크립트를 탈출할 수 없다', () => {
    const evil = { name: '아이폰 </script><img src=x onerror=alert(1)>' }
    const out = escapeJsonForHtml(evil)
    assert.ok(!out.includes('</script>'), '스크립트 종료 태그가 그대로 남았다')
    assert.ok(!out.includes('<'), '< 가 escape 되지 않았다')
    assert.ok(!out.includes('>'), '> 가 escape 되지 않았다')
    // escape 후에도 파싱하면 원본이 그대로 나와야 한다
    assert.deepEqual(JSON.parse(out), evil)
  })

  test('줄바꿈 취급되는 유니코드도 escape 한다', () => {
    const out = escapeJsonForHtml({ a: '\u2028\u2029' })
    assert.ok(!out.includes('\u2028'))
    assert.deepEqual(JSON.parse(out), { a: '\u2028\u2029' })
  })
})

describe('제품 매칭 — 형제 모델 구분', () => {
  const cases: Array<[string, string]> = [
    ['아이폰16 128 화이트', '아이폰 16'],
    ['아이폰 16 프로 256', '아이폰 16 Pro'],
    ['아이폰16프로맥스 1테라', '아이폰 16 Pro Max'],
    ['iPhone 16 Pro Max 256GB', '아이폰 16 Pro Max'],
    ['아이폰16플러스 팝니다', '아이폰 16 Plus'],
    ['아이폰 16e 128', '아이폰 16e'],
    ['갤럭시S24 256', '갤럭시 S24'],
    ['갤럭시 S24 울트라 512', '갤럭시 S24 Ultra'],
    ['갤럭시s24플러스', '갤럭시 S24 Plus'],
    ['갤럭시 Z 플립6 256', '갤럭시 Z 플립 6'],
    ['z폴드5 512', '갤럭시 Z 폴드 5'],
    ['에어팟 프로 2세대', '에어팟 프로 2세대'],
    ['에어팟 3세대 미개봉', '에어팟 3세대'],
    ['에어팟맥스', '에어팟 맥스'],
    ['닌텐도 스위치 OLED', '닌텐도 스위치 OLED'],
    ['닌텐도스위치 라이트 옐로', '닌텐도 스위치 라이트'],
    ['닌텐도 스위치 조이콘 포함', '닌텐도 스위치'],
    ['PS5 슬림', '플레이스테이션 5 슬림'],
    ['플스5 디스크 에디션', '플레이스테이션 5'],
    ['맥북에어 M2 256', '맥북 에어 M2 13"'],
    ['맥북 프로 14 M4 1테라', '맥북 프로 14" M4'],
    ['M3 맥북프로 14인치', '맥북 프로 14" M3'],
    ['아이패드 프로 11 M4 셀룰러', '아이패드 프로 11 (M4)'],
    ['소니 WH-1000XM5 블랙', '소니 WH-1000XM5'],
  ]
  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      assert.equal(nameOf(title), expected)
    })
  }

  test('더 구체적인 모델이 항상 이긴다', () => {
    const base = m.match('아이폰16')!
    const pro = m.match('아이폰16프로')!
    const max = m.match('아이폰16프로맥스')!
    assert.ok(max.matchedLength > pro.matchedLength)
    assert.ok(pro.matchedLength > base.matchedLength)
  })

  test('카탈로그에 없는 물건은 매칭하지 않는다', () => {
    assert.equal(m.match('삼성 냉장고 500L'), null)
    assert.equal(m.match('나이키 운동화 270'), null)
  })

  test('검색 자동완성이 후보를 준다', () => {
    const s = m.suggest('아이폰 16')
    assert.ok(s.length > 0)
    assert.ok(s.some((p) => p.name === '아이폰 16 Pro'))
  })
})

describe('글 종류 분류', () => {
  const cases: Array<[string, string]> = [
    ['아이폰16프로 256 팝니다', 'item'],
    ['아이폰 매입합니다 고가매입', 'wanted'],
    ['갤럭시S24 삽니다', 'wanted'],
    ['아이폰15 액정파손 부품용', 'parts'],
    ['아이폰14 침수폰', 'parts'],
    ['아이폰16 프로 케이스', 'accessory'],
    ['갤럭시S24 강화유리 필름', 'accessory'],
    ['아이폰16 대여 일주일', 'service'],
    ['아이폰 대량 도매', 'bulk'],
    ['아이폰16프로 케이스 포함 풀박스', 'item'],
    ['에어팟프로2 실리콘 케이스 증정', 'item'],
  ]
  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      assert.equal(classifyKind(title).kind, expected)
    })
  }
  test('액세서리는 감추지 않고 라벨만 붙인다', () => {
    // 케이스를 찾는 사람에게 케이스는 정답이다
    assert.equal(classifyKind('아이폰16 프로 케이스').kind, 'accessory')
  })
  test('미개봉 판정', () => {
    assert.equal(looksSealed('아이폰16 미개봉'), true)
    assert.equal(looksSealed('아이폰16 생활기스'), false)
  })
})

describe('변형 추출', () => {
  const p16pro = m.getBySlug('iphone-16-pro')!
  test('단위 있는 용량', () => {
    assert.equal(extractVariant('아이폰16프로 256GB', p16pro).storageGb, 256)
    assert.equal(extractVariant('아이폰16프로 1테라', p16pro).storageGb, 1024)
  })
  test('앞 숫자가 붙어도 실재 용량을 찾는다', () => {
    const ipad = m.getBySlug('ipad-pro-11-m4')!
    assert.equal(extractVariant('아이패드 프로 11 M4 256GB', ipad).storageGb, 256)
  })
  test('가격 표기를 용량으로 오인하지 않는다', () => {
    assert.equal(extractVariant('아이폰 16 프로 128만원', p16pro).storageGb, undefined)
  })
  test('그 제품이 팔지 않는 용량은 무시한다', () => {
    assert.equal(extractVariant('아이폰16프로 32GB', p16pro).storageGb, undefined)
  })
  test('색상·등급·미개봉', () => {
    const v = extractVariant('아이폰16프로 데저트 티타늄 S급 미개봉', p16pro)
    assert.equal(v.color, 'desert-titanium')
    assert.equal(v.grade, 'S')
    assert.equal(v.sealed, true)
  })
  test('변형 키', () => {
    assert.equal(buildVariantKey({ storageGb: 256 }, p16pro), 's256')
    assert.equal(buildVariantKey({}, p16pro), null)
    assert.equal(formatVariantKey('s1024'), '1TB')
    assert.equal(formatVariantKey(null), '전체')
  })
  test('통신사', () => {
    assert.equal(extractCarrier('아이폰16 자급제'), 'unlocked')
    assert.equal(extractCarrier('갤럭시S24 SKT'), 'skt')
    assert.equal(extractCarrier('아이폰16'), null)
  })
})

describe('분류 사전 안전성', () => {
  test('한 글자 키워드는 사전에 없어야 한다', () => {
    // "삼" 하나가 "삼성" 전체를 매입글로 만든 사고가 있었다. 구조적으로 막는다.
    for (const [name, words] of Object.entries(KIND_DICT)) {
      for (const w of words) {
        assert.ok(w.length >= 2, `${name} 사전에 한 글자 키워드: "${w}"`)
      }
    }
  })

  test('브랜드명이 분류 키워드에 걸리지 않는다', () => {
    const brands = ['삼성', '삼성전자', '독일', '단독', '커버낫', '가방', '보관함', '성지곡']
    for (const b of brands) {
      const v = classifyKind(`${b} 제품 판매합니다`)
      assert.equal(v.kind, 'item', `"${b}" 가 ${v.kind} 로 분류됨 (근거: ${v.hit})`)
    }
  })

  test('일반 판매글 코퍼스의 대부분은 판매글로 분류된다', () => {
    const corpus = [
      '삼성 김치냉장고 221리터 배송 가능',
      'LG 통돌이 세탁기 15kg 팝니다',
      '허먼밀러 에어론 의자 B사이즈 블랙',
      '다이슨 청소기 V11 상태 좋아요',
      '캐논 EOS R6 바디 판매',
      '트렉 로드 자전거 54사이즈',
      '이케아 4인용 식탁 원목',
      '에어컨 스탠드형 삼성 무풍',
      '플스5 디스크 에디션 팝니다',
      '루이비통 스피디 30 정품',
      '나이키 에어포스1 270mm',
      '유모차 부가부 폭스3',
      '전동킥보드 나인봇 맥스',
      '캠핑 텐트 코베아 4인용',
      '기계식 키보드 리얼포스 R3',
      '갤럭시탭 S9 울트라 256기가',
      '오디오 인터페이스 스칼렛 2i2',
      '전기밥솥 쿠쿠 10인용',
      '책상 모션데스크 전동',
      '아이패드 프로 11 M4 셀룰러',
    ]
    const kinds = corpus.map((t) => classifyKind(t).kind)
    const items = kinds.filter((k) => k === 'item').length
    assert.ok(
      items >= corpus.length - 2,
      `판매글 ${corpus.length}건 중 ${items}건만 item 으로 분류됨: ${corpus
        .map((t, i) => (kinds[i] === 'item' ? null : `${t}→${kinds[i]}`))
        .filter(Boolean)
        .join(', ')}`,
    )
  })

  test('진짜 매입글은 여전히 잡는다', () => {
    const wanted = [
      '아이폰 매입합니다 고가매입',
      '노트북 삽니다 연락주세요',
      '냉장고 구합니다',
      '중고 카메라 고가매입 전문',
    ]
    for (const t of wanted) assert.equal(classifyKind(t).kind, 'wanted', t)
  })
})
