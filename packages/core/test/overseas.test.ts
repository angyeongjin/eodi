import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { translateToJapanese, suggestGoodsTerms, GOODS_TERMS } from '../src/goods.js'
import { toKrw, setFxRate, getFxRate, formatMoney, formatApproxKrw, DEFAULT_JPY_KRW } from '../src/fx.js'
import { tokenize } from '../src/text.js'
import { enrichAll } from '../src/enrich.js'
import { ProductMatcher } from '../src/catalog.js'
import { CATALOG } from '../src/catalog.data.js'
import { applyFilters } from '../src/filter.js'
import { mergeDuplicates } from '../src/dedupe.js'
import { SOURCE_SCOPE } from '../src/types.js'
import type { RawListing } from '../src/types.js'

const m = new ProductMatcher(CATALOG)
let seq = 0
const L = (o: Partial<RawListing> & { title: string; price: number }): RawListing => ({
  source: 'yahoo_auction',
  sourceItemId: `y${++seq}`,
  url: 'https://x/1',
  currency: 'JPY',
  ...o,
})

describe('한→일 굿즈 사전', () => {
  test('사전이 로드된다', () => {
    assert.ok(GOODS_TERMS.length >= 250, `사전이 ${GOODS_TERMS.length}항목뿐이다`)
    // 캐릭터가 가장 큰 미번역 원인이었다. 충분히 채워졌는지 본다.
    assert.ok(GOODS_TERMS.filter((t) => t.kind === 'character').length >= 80)
  })

  test('한 글자 표제어는 없다', () => {
    // "돌" 하나가 "돌잔치"를 ドール 로 만든다
    for (const t of GOODS_TERMS) {
      for (const k of t.ko) assert.ok(k.length >= 2, `한 글자 표제어: "${k}" → ${t.ja}`)
    }
  })

  test('같은 한글이 서로 다른 일본어로 매핑되지 않는다', () => {
    const seen = new Map<string, string>()
    for (const t of GOODS_TERMS) {
      for (const k of t.ko) {
        const prev = seen.get(k)
        assert.ok(!prev || prev === t.ja, `"${k}" 가 ${prev} 와 ${t.ja} 로 중복 매핑됨`)
        seen.set(k, t.ja)
      }
    }
  })

  const cases: Array<[string, string]> = [
    ['피규어', 'フィギュア'],
    ['넨도로이드 미쿠', 'ねんどろいど 初音ミク'],
    ['주술회전 아크릴스탠드', '呪術廻戦 アクリルスタンド'],
    ['귀칼 캔뱃지 미개봉', '鬼滅の刃 缶バッジ 未開封'],
    ['포켓몬 피카츄 인형', 'ポケモン ピカチュウ ぬいぐるみ'],
  ]
  for (const [ko, ja] of cases) {
    test(`"${ko}" → "${ja}"`, () => {
      assert.equal(translateToJapanese(ko).ja, ja)
    })
  }

  test('긴 표제어가 짧은 표제어를 이긴다', () => {
    // "아크릴스탠드"가 "아크릴"로 잘리면 안 된다
    assert.equal(translateToJapanese('아크릴스탠드').ja, 'アクリルスタンド')
    assert.equal(translateToJapanese('아크릴').ja, 'アクリル')
  })

  test('원문 등장 순서를 지킨다', () => {
    assert.equal(translateToJapanese('미쿠 넨도로이드').ja, '初音ミク ねんどろいど')
    assert.equal(translateToJapanese('넨도로이드 미쿠').ja, 'ねんどろいど 初音ミク')
  })

  test('일본어·영문 입력은 그대로 통과시킨다', () => {
    const t = translateToJapanese('ねんどろいど')
    assert.equal(t.passthrough, true)
    assert.equal(t.ja, 'ねんどろいど')
  })

  test('숫자와 영문은 살려서 함께 보낸다', () => {
    const t = translateToJapanese('넨도로이드 1483')
    assert.ok(t.ja?.includes('ねんどろいど'))
    assert.ok(t.ja?.includes('1483'))
  })

  test('사전에 없으면 지어내지 않고 null 을 준다', () => {
    const t = translateToJapanese('한샘 4인용 식탁')
    assert.equal(t.ja, null)
    assert.ok(t.unresolved.length > 0)
  })

  test('일부만 아는 경우 아는 만큼 옮기고 나머지를 알려준다', () => {
    const t = translateToJapanese('원피스 피규어 초레어한정딜')
    assert.ok(t.ja?.includes('ワンピース'))
    assert.ok(t.ja?.includes('フィギュア'))
    assert.ok(t.unresolved.length > 0, '모르는 말을 unresolved 로 보고하지 않았다')
  })

  test('캐릭터 이름을 옮긴다 — 사람들은 작품명이 아니라 캐릭터로 검색한다', () => {
    assert.equal(translateToJapanese('루피 피규어').ja, 'ルフィ フィギュア')
    assert.equal(translateToJapanese('고죠 아크릴스탠드').ja, '五条悟 アクリルスタンド')
    assert.equal(translateToJapanese('네즈코 넨도로이드').ja, '禰豆子 ねんどろいど')
  })

  test('캐릭터가 작품보다 우선한다', () => {
    // "짱구"는 작품(クレヨンしんちゃん)이 아니라 캐릭터(しんちゃん)로 검색해야 결과가 나온다
    assert.ok(translateToJapanese('짱구 인형').ja?.includes('しんちゃん'))
  })

  test('자동완성', () => {
    const s = suggestGoodsTerms('아크')
    assert.ok(s.length > 0)
    assert.ok(s.some((t) => t.ja === 'アクリルスタンド'))
  })
})

describe('일본어 토큰화', () => {
  test('히라가나·가타카나·한자를 각각 끊는다', () => {
    // 이게 없으면 해외 검색 랭킹이 전부 0점이 된다
    assert.deepEqual(tokenize('ねんどろいど 初音ミク'), ['ねんどろいど', '初音', 'ミク'])
  })
  test('한글은 그대로 동작한다', () => {
    assert.deepEqual(tokenize('갤럭시S24울트라'), ['갤럭시', 's', '24', '울트라'])
  })
})

describe('환율', () => {
  test('기본값이 있어 조회 실패해도 동작한다', () => {
    assert.ok(DEFAULT_JPY_KRW > 3 && DEFAULT_JPY_KRW < 30)
  })
  test('엔화를 원화로 바꾼다', () => {
    setFxRate({ jpyToKrw: 10, asOf: 'test' })
    assert.equal(toKrw(2000, 'JPY'), 20_000)
    assert.equal(toKrw(2000, 'KRW'), 2000)
    assert.equal(toKrw(2000, undefined), 2000)
  })
  test('말이 안 되는 환율은 받지 않는다', () => {
    setFxRate({ jpyToKrw: 10, asOf: 'test' })
    setFxRate({ jpyToKrw: -1, asOf: 'bad' })
    assert.equal(getFxRate().jpyToKrw, 10)
    setFxRate({ jpyToKrw: DEFAULT_JPY_KRW, asOf: 'test' })
  })
  test('표기', () => {
    assert.equal(formatMoney(2199, 'JPY'), '¥2,199')
    assert.equal(formatMoney(15000, 'KRW'), '15,000원')
    assert.equal(formatMoney(0, 'KRW'), '나눔')
    // 환산가는 지불액이 아니므로 뭉갠다
    assert.equal(formatApproxKrw(18_947), '약 18,900원')
  })
})

describe('통화가 섞여도 값이 어긋나지 않는다', () => {
  test('원화 환산가로 필터한다', () => {
    setFxRate({ jpyToKrw: 10, asOf: 'test' })
    const rows = enrichAll(
      [
        L({ title: 'ねんどろいど A', price: 2000, currency: 'JPY' }), // 20,000원
        L({ title: 'ねんどろいど B', price: 500, currency: 'JPY' }), //   5,000원
      ],
      m,
    )
    assert.equal(rows[0]!.priceKrw, 20_000)
    assert.equal(rows[1]!.priceKrw, 5_000)
    // ¥2,000 이 2,000원으로 취급되면 이 필터에 걸려버린다
    const out = applyFilters(mergeDuplicates(rows), { minPrice: 10_000 }, new Date())
    assert.equal(out.length, 1)
    assert.equal(out[0]!.price, 2000)
  })

  test('중복 판별도 원화 기준으로 한다', () => {
    setFxRate({ jpyToKrw: 10, asOf: 'test' })
    const rows = enrichAll(
      [
        L({ source: 'yahoo_auction', title: 'ねんどろいど 初音ミク 未開封', price: 2000, currency: 'JPY' }),
        L({ source: 'mercari', title: 'ねんどろいど 初音ミク 未開封', price: 2000, currency: 'JPY' }),
      ],
      m,
    )
    assert.equal(mergeDuplicates(rows).length, 1)
  })

  test('scope 가 소스에서 자동으로 붙는다', () => {
    const [jp] = enrichAll([L({ title: 'x', price: 100, source: 'yahoo_auction' })], m)
    const [kr] = enrichAll([L({ title: 'x', price: 100, source: 'bunjang', currency: 'KRW' })], m)
    assert.equal(jp!.scope, 'overseas')
    assert.equal(kr!.scope, 'domestic')
  })

  test('모든 소스에 시장 구분이 정의되어 있다', () => {
    for (const [id, scope] of Object.entries(SOURCE_SCOPE)) {
      assert.ok(scope === 'domestic' || scope === 'overseas', `${id} 의 scope 가 잘못됨`)
    }
  })
})

describe('매물 주의 신호', () => {
  const w = async (title: string) => {
    const { detectWarnings } = await import('../src/warnings.js')
    return detectWarnings(title)
  }

  test('일본어 가품 표기를 잡는다 — 한국 사용자가 놓치는 지점', async () => {
    assert.deepEqual(await w('ねんどろいど 初音ミク 海賊版'), ['replica'])
    assert.deepEqual(await w('フィギュア レプリカ'), ['replica'])
    assert.deepEqual(await w('非正規品 フィギュア'), ['replica'])
  })

  test('한국어 가품 표기도 잡는다', async () => {
    assert.deepEqual(await w('피규어 짝퉁 아님'), ['replica'])
    assert.deepEqual(await w('중국판 넨도로이드'), ['replica'])
  })

  test('개조·자작은 가품과 구분한다 — 일부러 찾는 사람이 있다', async () => {
    assert.deepEqual(await w('ガレージキット 塗装済み'), ['modified'])
    assert.deepEqual(await w('리페인팅 피규어'), ['modified'])
  })

  test('예약 상품은 지금 받을 수 없다는 뜻이다', async () => {
    assert.deepEqual(await w('ねんどろいど 予約'), ['preorder'])
    assert.deepEqual(await w('사전예약 아크릴스탠드'), ['preorder'])
  })

  test('흠·정크 표기', async () => {
    assert.deepEqual(await w('難あり中古品 ねんどろいど'), ['damaged'])
    assert.deepEqual(await w('ジャンク 動作未確認'), ['junk'])
  })

  test('여러 신호가 겹치면 전부 붙인다', async () => {
    const got = await w('海賊版 改造 難あり')
    assert.deepEqual(got.sort(), ['damaged', 'modified', 'replica'])
  })

  test('정상 매물에는 아무 신호도 없다', async () => {
    assert.deepEqual(await w('ねんどろいど 初音ミク 新品未開封 国内正規品'), [])
    assert.deepEqual(await w('아이폰16 프로 256GB 자급제'), [])
  })

  test('"정품"은 배지로 달지 않는다 — 판매자 주장이지 우리가 검증한 사실이 아니다', async () => {
    const { WARNING_LABEL } = await import('../src/warnings.js')
    const labels = Object.values(WARNING_LABEL).join(' ')
    assert.ok(!labels.includes('정품 인증'))
    assert.ok(!labels.includes('진품'))
  })

  test('사전에 한 글자 키워드가 없다', async () => {
    const { WARNING_DICT } = await import('../src/warnings.js')
    for (const [k, words] of Object.entries(WARNING_DICT)) {
      for (const word of words) assert.ok(word.length >= 2, `${k}: "${word}"`)
    }
  })

  test('가품 표기 매물은 순위가 내려간다', async () => {
    const { interpretQuery } = await import('../src/query.js')
    const { rank } = await import('../src/rank.js')
    const q = interpretQuery('피규어', m)
    const rows = enrichAll(
      [
        L({ title: 'フィギュア 海賊版 激安', price: 500, currency: 'JPY' }),
        L({ title: 'フィギュア 新品未開封', price: 500, currency: 'JPY' }),
      ],
      m,
    )
    const ranked = rank(mergeDuplicates(rows), q, 'relevance', new Date())
    assert.equal(ranked[0]!.warnings.length, 0, '가품 표기 매물이 위로 올라왔다')
  })

  test('경고가 붙어도 결과에서 사라지지는 않는다', () => {
    const rows = enrichAll([L({ title: 'フィギュア 海賊版', price: 500, currency: 'JPY' })], m)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0]!.warnings, ['replica'])
  })
})

describe('주의 신호 오탐 방어', () => {
  test('정상 상품 설명을 경고로 오인하지 않는다', async () => {
    const { detectWarnings } = await import('../src/warnings.js')
    // 실제 야후옥션 매물 제목에서 가져온 정상 표기들.
    // "塗装済み完成品" 은 공장 도색 완성품이라는 뜻이라 개조가 아니다.
    const normal = [
      'グッドスマイルカンパニー ねんどろいど 艦隊これくしょん 赤城 ノンスケール ABS 塗装済み完成品',
      'ねんどろいど 初音ミク 新品未開封 国内正規品',
      'フィギュア 中古品 箱付き 美品',
      '피규어 정품 새제품 박스포함',
      'アクリルスタンド 未使用 送料無料',
      'ROBOT魂 MS-06 量産型ザク ver. A.N.I.M.E.',
    ]
    for (const t of normal) {
      assert.deepEqual(detectWarnings(t), [], `정상 매물을 경고로 잡았다: "${t}"`)
    }
  })

  test('진짜 개조·자작은 여전히 잡는다', async () => {
    const { detectWarnings } = await import('../src/warnings.js')
    for (const t of ['ガレージキット 未塗装', 'ねんどろいど ヘッド 髪パーツ カスタム', '改造品 フィギュア']) {
      assert.ok(detectWarnings(t).includes('modified'), `개조를 놓쳤다: "${t}"`)
    }
  })
})

describe('초성 검색', () => {
  test('초성을 뽑는다', async () => {
    const { toChoseong } = await import('../src/hangul.js')
    assert.equal(toChoseong('귀멸의칼날'), 'ㄱㅁㅇㅋㄴ')
    assert.equal(toChoseong('주술회전'), 'ㅈㅅㅎㅈ')
    assert.equal(toChoseong('iPhone 16'), 'iPhone16')
  })

  test('초성 질의인지 판별한다', async () => {
    const { isChoseongQuery } = await import('../src/hangul.js')
    assert.equal(isChoseongQuery('ㅈㅅㅎㅈ'), true)
    assert.equal(isChoseongQuery('주술'), false)
    assert.equal(isChoseongQuery('ㄱ'), false, '한 글자는 후보가 너무 많다')
  })

  test('겹자음 차이를 무시한다', async () => {
    const { matchesChoseong } = await import('../src/hangul.js')
    // 사용자는 ㄲ 대신 ㄱ 을 치는 경우가 많다
    assert.equal(matchesChoseong('ㄱㅁ', '꾸미기'), true)
  })

  test('앞에서부터만 맞춘다 — 중간 일치까지 허용하면 자동완성이 쓸모없어진다', async () => {
    const { matchesChoseong } = await import('../src/hangul.js')
    assert.equal(matchesChoseong('ㅎㅈ', '주술회전'), false)
    assert.equal(matchesChoseong('ㅈㅅ', '주술회전'), true)
  })

  test('초성으로 굿즈 사전을 찾는다', () => {
    const s = suggestGoodsTerms('ㅈㅅㅎㅈ', 5)
    assert.ok(s.some((t) => t.ja === '呪術廻戦'), '초성으로 주술회전을 못 찾았다')
    const n = suggestGoodsTerms('ㄴㄷㄹㅇㄷ', 5)
    assert.ok(n.some((t) => t.ja === 'ねんどろいど'))
  })

  test('일반 입력은 앞글자 일치를 우선한다', () => {
    const s = suggestGoodsTerms('피규', 5)
    assert.equal(s[0]?.ja, 'フィギュア', `앞글자 일치가 1순위가 아니다: ${s[0]?.ja}`)
  })
})

describe('사전 확장 후에도 안전한가', () => {
  test('항목 수가 크게 늘었다', () => {
    assert.ok(GOODS_TERMS.length >= 400, `사전이 ${GOODS_TERMS.length}항목뿐이다`)
  })
  test('확장한 작품·캐릭터가 실제로 번역된다', () => {
    const cases: Array<[string, string]> = [
      ['건담 피규어', 'ガンダム'],
      ['치이카와 인형', 'ちいかわ'],
      ['샤아 피규어', 'シャア'],
      ['하울 아크릴스탠드', 'ハウル'],
      ['유희왕 트레카', '遊戯王'],
    ]
    for (const [ko, ja] of cases) {
      assert.ok(translateToJapanese(ko).ja?.includes(ja), `"${ko}" → ${ja} 실패`)
    }
  })
  test('확장 후에도 일반 단어를 굿즈로 오인하지 않는다', () => {
    // 사전이 커질수록 오탐 위험도 커진다
    for (const q of ['한샘 식탁', '삼성 냉장고', '허먼밀러 의자', '나이키 운동화']) {
      assert.equal(translateToJapanese(q).ja, null, `"${q}" 를 굿즈로 오인했다`)
    }
  })
})

describe('굿즈 사전: 커뮤니티에서 실제로 쓰는 말', () => {
  /*
    사전을 정식 명칭으로만 채우면 정작 사람들이 치는 말로는 아무것도 안 나온다.
    아래는 디시 토이·피규어 갤러리와 야후옥션 실매물 제목에서 확인한 표현들이다.
    작품명은 있는데 캐릭터가 없어 0건이 나던 것(데쿠·바쿠고)이 출발점이었다.
  */
  test('캐릭터명으로 검색한다 — 사람은 작품이 아니라 최애를 산다', () => {
    const cases: Array<[string, string]> = [
      ['데쿠', 'デク'],
      ['바쿠고', '爆豪勝己'],
      ['루키아', 'ルキア'],
      ['마도카', 'まどか'],
      ['메구밍', 'めぐみん'],
    ]
    for (const [ko, ja] of cases) {
      assert.equal(translateToJapanese(ko).ja, ja, `"${ko}" 가 사전에 없다`)
    }
  })

  test('이치방쿠지 등급·용어가 매물 제목 그대로 읽힌다', () => {
    assert.equal(translateToJapanese('제일복권 A상').ja, '一番くじ A賞')
    assert.equal(translateToJapanese('라스원 데쿠').ja, 'ラストワン賞 デク')
  })

  test('팬들이 부르는 이름도 옮긴다', () => {
    // 야후옥션 실매물: 「緑谷出久 MASTERLISE ｰ頑張れ、デクｰ」, 「A賞 黒デク」
    assert.equal(translateToJapanese('간바레 데쿠').ja, '頑張れ デク')
    assert.equal(translateToJapanese('흑데쿠').ja, '黒デク')
    assert.equal(translateToJapanese('마스터라이즈').ja, 'MASTERLISE')
  })

  test('한 글자 표제어는 없다 — "삼"이 "삼성 냉장고"를 굿즈로 만든 적이 있다', () => {
    for (const t of GOODS_TERMS) {
      for (const k of t.ko) {
        assert.ok(k.length >= 2, `한 글자 표제어: "${k}" (${t.ja})`)
      }
    }
  })

  test('일상 중고 검색어를 굿즈로 오인하지 않는다', () => {
    for (const q of ['에어컨 청소', '아이폰 케이스', '자전거 헬멧', '캠핑 의자']) {
      assert.equal(translateToJapanese(q).ja, null, `"${q}" 를 굿즈로 오인했다`)
    }
  })
})
