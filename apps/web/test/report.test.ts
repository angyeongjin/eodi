import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { reportMailto } from '../lib/report.js'

/*
  제보 링크가 깨지면 사전을 키우는 유일한 사람 경로가 막힌다.
  메일 클라이언트는 잘못된 mailto 를 조용히 무시하므로, 깨져도 아무도 모른다.
*/

function parse(href: string) {
  assert.ok(href.startsWith('mailto:'), 'mailto 로 시작해야 한다')
  const [to, qs] = href.slice('mailto:'.length).split('?')
  const params = new URLSearchParams(qs)
  return { to, subject: params.get('subject') ?? '', body: params.get('body') ?? '' }
}

describe('제보 메일 링크', () => {
  test('못 옮긴 말이 제목에 들어간다 — 받는 사람이 목록만 보고 분류할 수 있어야 한다', () => {
    const { to, subject } = parse(
      reportMailto({ to: 'hello@eodizzi.com', term: '주술회전 아크릴스탠드', missed: ['아크릴스탠드'] }),
    )
    assert.equal(to, 'hello@eodizzi.com')
    assert.equal(subject, '굿즈 사전 제보: 아크릴스탠드')
  })

  test('못 옮긴 말을 특정하지 못했으면 검색어 전체를 쓴다', () => {
    const { subject } = parse(reportMailto({ to: 'hello@eodizzi.com', term: '없는말꾸러미' }))
    assert.equal(subject, '굿즈 사전 제보: 없는말꾸러미')
  })

  test('본문에 검색어와 못 옮긴 말이 함께 담긴다', () => {
    const { body } = parse(
      reportMailto({ to: 'hello@eodizzi.com', term: '주술회전 아크릴스탠드', missed: ['아크릴스탠드'] }),
    )
    assert.match(body, /검색어: 주술회전 아크릴스탠드/)
    assert.match(body, /못 옮긴 말: 아크릴스탠드/)
    assert.match(body, /일본어 표기/)
  })

  test('못 옮긴 말이 없으면 그 줄을 넣지 않는다', () => {
    const { body } = parse(reportMailto({ to: 'hello@eodizzi.com', term: '테스트' }))
    assert.doesNotMatch(body, /못 옮긴 말/)
  })

  test('& 나 줄바꿈이 쿼리스트링을 깨지 않는다', () => {
    const href = reportMailto({ to: 'hello@eodizzi.com', term: 'A&B=C', missed: ['A&B=C'] })
    const { subject, body } = parse(href)
    assert.equal(subject, '굿즈 사전 제보: A&B=C')
    assert.match(body, /검색어: A&B=C/)
  })
})
