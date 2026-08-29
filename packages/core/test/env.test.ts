import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { envStr, envNum, envBool, envList, envOptional } from '../src/env.js'

const KEY = 'EODI_TEST_VAR'
beforeEach(() => { delete process.env[KEY] })

describe('환경변수 읽기 — 빈 값은 "설정 안 함"이다', () => {
  test('`.env` 템플릿의 빈 키가 기본값을 무력화하면 안 된다', () => {
    /*
      이게 이 모듈이 존재하는 이유다.
      `process.env.X ?? 6000` 은 X='' 일 때 '' 를 그대로 쓰고,
      Number('') === 0 이 되어 모든 소스가 즉시 타임아웃됐을 뻔했다.
    */
    process.env[KEY] = ''
    assert.equal(envNum(KEY, 6000), 6000)
    assert.equal(envStr(KEY, 'fallback'), 'fallback')
    assert.equal(envOptional(KEY), undefined)
  })

  test('공백만 있어도 설정 안 한 것으로 본다', () => {
    process.env[KEY] = '   '
    assert.equal(envStr(KEY, 'fallback'), 'fallback')
    assert.equal(envNum(KEY, 42), 42)
  })

  test('실제 값은 그대로 쓴다', () => {
    process.env[KEY] = '  hello  '
    assert.equal(envStr(KEY, 'fallback'), 'hello', '앞뒤 공백은 다듬는다')
    process.env[KEY] = '1234'
    assert.equal(envNum(KEY, 0), 1234)
  })

  test('숫자로 못 읽히면 기본값으로 떨어진다', () => {
    process.env[KEY] = 'abc'
    assert.equal(envNum(KEY, 7), 7, '0 이 되어 조용히 망가지면 안 된다')
    process.env[KEY] = 'NaN'
    assert.equal(envNum(KEY, 7), 7)
  })

  test('0 은 유효한 값이다', () => {
    process.env[KEY] = '0'
    assert.equal(envNum(KEY, 999), 0)
  })

  test('불리언', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
      process.env[KEY] = v
      assert.equal(envBool(KEY), true, v)
    }
    for (const v of ['0', 'false', 'no', '']) {
      process.env[KEY] = v
      assert.equal(envBool(KEY), false, v)
    }
  })

  test('목록은 빈 항목을 버린다', () => {
    process.env[KEY] = 'a, ,b,,c '
    assert.deepEqual(envList(KEY), ['a', 'b', 'c'])
    process.env[KEY] = ''
    assert.deepEqual(envList(KEY), [])
  })
})

describe('실제 설정값이 빈 환경변수에 무너지지 않는다', () => {
  test('소스 타임아웃', async () => {
    process.env['SOURCE_TIMEOUT_MS'] = ''
    assert.equal(envNum('SOURCE_TIMEOUT_MS', 6000), 6000)
    delete process.env['SOURCE_TIMEOUT_MS']
  })
  test('User-Agent — 비면 우리가 자기를 밝히지 않게 된다', () => {
    process.env['EODI_UA'] = ''
    const ua = envStr('EODI_UA', 'EodizziBot/0.1 (+https://example; x)')
    assert.ok(ua.startsWith('EodizziBot'), 'UA 가 비었다')
    delete process.env['EODI_UA']
  })
})
