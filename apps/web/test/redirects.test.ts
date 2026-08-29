import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { legacyRedirects } from '../lib/redirects.mjs'

/*
  도메인 전환은 한 번뿐이지만 틀리면 되돌리기 비싸다.
  잘못 만들면 무한 리다이렉트로 사이트 전체가 죽고, 안 만들면 색인된 733개 주소가 갈린다.
*/

describe('도메인 전환: 규칙이 만들어지지 않아야 하는 경우', () => {
  test('옛 호스트가 없으면 아무 규칙도 없다 — 도메인 구매 전 상태', () => {
    assert.deepEqual(legacyRedirects({ siteUrl: 'https://eodizzi.com' }), [])
    assert.deepEqual(legacyRedirects({ siteUrl: 'https://eodizzi.com', legacyHosts: '' }), [])
  })

  test('새 주소가 없으면 아무 규칙도 없다', () => {
    assert.deepEqual(legacyRedirects({ legacyHosts: 'eodi.vercel.app' }), [])
  })

  test('환경변수가 통째로 없어도 터지지 않는다', () => {
    assert.deepEqual(legacyRedirects({}), [])
    // @ts-expect-error 런타임에는 undefined 가 들어올 수 있다
    assert.deepEqual(legacyRedirects(undefined), [])
  })

  test('주소를 해석하지 못하면 규칙을 만들지 않는다 — 엉뚱한 곳으로 보내느니 그대로 둔다', () => {
    assert.deepEqual(legacyRedirects({ siteUrl: 'eodizzi.com', legacyHosts: 'eodi.vercel.app' }), [])
    assert.deepEqual(legacyRedirects({ siteUrl: 'ftp://eodizzi.com', legacyHosts: 'eodi.vercel.app' }), [])
  })

  test('자기 자신을 옛 호스트로 넣으면 무시한다 — 무한 리다이렉트 방지', () => {
    assert.deepEqual(legacyRedirects({ siteUrl: 'https://eodizzi.com', legacyHosts: 'eodizzi.com' }), [])
    assert.deepEqual(legacyRedirects({ siteUrl: 'https://eodizzi.com', legacyHosts: 'EODIZZI.COM' }), [])
  })
})

describe('도메인 전환: 규칙의 모양', () => {
  test('경로를 유지한 채 301 로 넘긴다', () => {
    const rules = legacyRedirects({
      siteUrl: 'https://eodizzi.com',
      legacyHosts: 'eodi.vercel.app',
    })
    assert.equal(rules.length, 1)
    assert.deepEqual(rules[0], {
      source: '/:path*',
      has: [{ type: 'host', value: 'eodi.vercel.app' }],
      destination: 'https://eodizzi.com/:path*',
      permanent: true,
    })
  })

  test('여러 옛 호스트를 쉼표로 넘길 수 있고 공백과 대소문자는 정리된다', () => {
    const rules = legacyRedirects({
      siteUrl: 'https://eodizzi.com',
      legacyHosts: ' eodi.vercel.app , WWW.EODIZZI.COM ,, eodi.vercel.app ',
    })
    assert.deepEqual(
      rules.map((r) => r.has[0]?.value),
      ['eodi.vercel.app', 'www.eodizzi.com'],
      '중복은 한 번만, 빈 값은 버린다',
    )
  })

  test('새 주소의 경로는 목적지에 섞이지 않는다', () => {
    const rules = legacyRedirects({
      siteUrl: 'https://eodizzi.com/',
      legacyHosts: 'eodi.vercel.app',
    })
    assert.equal(rules[0]?.destination, 'https://eodizzi.com/:path*')
  })
})
