import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { suggestCorrection, fromQwerty, toJamo } from '../src/typo.js'
import { GOODS_TERMS } from '../src/goods.js'

describe('자판을 안 바꾸고 친 검색어', () => {
  test('두벌식 조합 규칙을 지켜 되돌린다', () => {
    // 받침이 다음 글자의 초성으로 넘어가는 것까지 맞아야 쓸모가 있다
    assert.equal(fromQwerty('wntnfghlwjs'), '주술회전')
    assert.equal(fromQwerty('vlrbdj'), '피규어')
  })

  test('되돌린 말이 사전에 있을 때만 제안한다', () => {
    assert.deepEqual(suggestCorrection('wntnfghlwjs'), { suggestion: '주술회전', reason: 'keyboard' })
    // 되돌려도 아는 말이 아니면 지어내지 않는다
    assert.equal(suggestCorrection('hello world'), null)
    assert.equal(suggestCorrection('iphone 16'), null)
  })
})

describe('철자 오타', () => {
  test('한 자모 차이는 잡는다', () => {
    assert.equal(suggestCorrection('주슬회전')?.suggestion, '주술회전')
    assert.equal(suggestCorrection('아크릴스텐드')?.suggestion, '아크릴스탠드')
  })

  test('여러 낱말 중 틀린 것만 고친다', () => {
    assert.equal(suggestCorrection('데구 피규어')?.suggestion, '데쿠 피규어')
  })

  test('맞게 친 사람은 건드리지 않는다', () => {
    /*
      맞는 검색어에 "혹시 이거?" 를 들이미는 것이 틀린 사람을 놓치는 것보다 나쁘다.
      한 번 헛짚으면 다음부터 이 안내를 아무도 안 읽는다.
    */
    for (const q of ['주술회전', '데쿠', '피규어', '넨도로이드', '아이폰16', '자전거', '삼성 냉장고']) {
      assert.equal(suggestCorrection(q), null, `"${q}" 를 오타로 봤다`)
    }
  })

  test('사전에 있는 모든 표제어는 스스로 오타가 아니다', () => {
    const wrong: string[] = []
    for (const t of GOODS_TERMS) {
      for (const ko of t.ko) {
        if (!/[가-힣]/.test(ko)) continue
        if (suggestCorrection(ko) !== null) wrong.push(ko)
      }
    }
    assert.deepEqual(wrong, [], '표제어 자신이 오타로 잡혔다')
  })
})

describe('자모 분해', () => {
  test('한국어 오타는 음절이 아니라 자모에서 난다', () => {
    assert.equal(toJamo('주술'), 'ㅈㅜㅅㅜㄹ')
    assert.equal(toJamo('값'), 'ㄱㅏㅄ')
    // 한글이 아닌 글자는 그대로 둔다
    assert.equal(toJamo('a1가'), 'a1ㄱㅏ')
  })
})
