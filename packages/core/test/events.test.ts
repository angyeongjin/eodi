import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseEvent } from '../src/events.js'

/*
  이 값들은 전부 브라우저가 보낸 것이다. 지어낸 소스 이름이나 200만 번째 순위가
  통계에 섞이면, 우리는 그걸 근거로 랭킹을 고치게 된다. 그래서 경계에서 막는다.
*/

describe('parseEvent — 받아들이는 것', () => {
  test('제대로 된 아웃바운드 클릭', () => {
    const e = parseEvent({
      kind: 'outbound',
      scope: 'overseas',
      surface: 'landing',
      source: 'yahoo_auction',
      position: 3,
      normalized: '주술회전 아크릴스탠드',
    })
    assert.deepEqual(e, {
      kind: 'outbound',
      scope: 'overseas',
      surface: 'landing',
      source: 'yahoo_auction',
      position: 3,
      normalized: '주술회전 아크릴스탠드',
    })
  })

  test('화면을 안 알려주면 검색으로 본다 — 기존 클라이언트와의 호환', () => {
    assert.equal(parseEvent({ kind: 'outbound', source: 'bunjang' })?.surface, 'search')
  })

  test('모르는 화면 이름은 검색으로 떨어진다', () => {
    // 여기서 이벤트를 버리면 클릭이 통째로 사라진다. 대신 가장 보수적인 칸에 넣는다.
    assert.equal(parseEvent({ kind: 'outbound', source: 'bunjang', surface: '어딘가' })?.surface, 'search')
  })

  test('scope 를 안 주면 국내로 본다', () => {
    assert.equal(parseEvent({ kind: 'outbound', source: 'bunjang' })?.scope, 'domestic')
  })

  test('모르는 scope 는 국내로 떨어진다 — 이벤트를 버리진 않는다', () => {
    assert.equal(parseEvent({ kind: 'outbound', source: 'bunjang', scope: '화성' })?.scope, 'domestic')
  })

  test('순위·검색어가 없어도 클릭 자체는 센다', () => {
    const e = parseEvent({ kind: 'outbound', source: 'daangn' })
    assert.equal(e?.position, null)
    assert.equal(e?.normalized, null)
  })

  test('검색어는 앞뒤 공백을 털고 120자에서 자른다', () => {
    const e = parseEvent({ kind: 'outbound', source: 'daangn', normalized: `  ${'가'.repeat(200)}  ` })
    assert.equal(e?.normalized?.length, 120)
  })
})

describe('parseEvent — 버리는 것', () => {
  test('모르는 종류', () => {
    assert.equal(parseEvent({ kind: '구매', source: 'bunjang' }), null)
  })

  test('어느 마켓으로 나갔는지 모르는 아웃바운드 — 소스별 비중이 존재 이유다', () => {
    assert.equal(parseEvent({ kind: 'outbound' }), null)
    assert.equal(parseEvent({ kind: 'outbound', source: '어딘가' }), null)
  })

  test('객체가 아닌 것', () => {
    for (const bad of [null, undefined, 'outbound', 42, ['outbound']]) {
      assert.equal(parseEvent(bad), null)
    }
  })

  test('말이 안 되는 순위는 필드만 비운다', () => {
    for (const bad of [-1, 1000, 1.5, NaN, '3']) {
      const e = parseEvent({ kind: 'outbound', source: 'bunjang', position: bad })
      assert.equal(e?.position, null, `position=${String(bad)} 는 버려야 한다`)
    }
  })

  test('프로토타입 오염을 소스로 넘기려는 시도', () => {
    // SOURCE_LABEL 을 `in` 으로 검사하면 'toString' 이 통과한다. hasOwnProperty 를 쓰는 이유.
    assert.equal(parseEvent({ kind: 'outbound', source: 'toString' }), null)
    assert.equal(parseEvent({ kind: 'outbound', source: 'constructor' }), null)
  })
})
