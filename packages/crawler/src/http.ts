import { envNum, envStr } from '@eodi/core'
import { parseRobots, isAllowed, type RobotsRules } from './robots.js'

/**
 * 모든 외부 요청이 지나는 단 하나의 문.
 * 여기만 보면 우리가 남의 서버에 무슨 짓을 하는지 전부 알 수 있어야 한다.
 */

/*
  우리가 남의 서버에 자기를 밝히는 문자열.

  연락처 URL 은 **지금 확실히 열리는 곳**이어야 한다.
  사이트 운영자가 우리 봇을 발견하고 찾아왔는데 주소가 죽어 있으면
  자기를 밝힌 의미가 없다. 도메인을 사기 전이므로 저장소를 가리킨다 —
  거기에 수집 원칙(README)과 코드가 다 있어서 오히려 확인하기 좋다.
  도메인이 연결되면 EODI_UA 환경변수로 사이트의 /about 을 가리키게 바꾼다.

  HTTP 헤더는 Latin-1 만 담을 수 있어 한글을 넣으면 fetch 가 통째로 실패한다.
*/
export const USER_AGENT = envStr(
  'EODI_UA',
  'EodizziBot/0.1 (+https://github.com/angyeongjin/eodi; used-market meta search)',
)

/**
 * robots.txt 에서 우리를 지목한 규칙을 찾을 때 쓰는 토큰.
 *
 * UA 문자열에서 **직접 뽑는다.** 상수로 따로 적어두면 UA 를 바꿀 때 같이 안 바뀌고,
 * 그러면 사이트가 `User-agent: EodizziBot / Disallow: /` 라고 우리를 지목해 막아도
 * 그 규칙을 조용히 무시하게 된다. 실제로 브랜드 이름을 바꾸다가 이 사고를 낼 뻔했다.
 */
const UA_TOKEN = (USER_AGENT.match(/^([A-Za-z][\w-]*)/)?.[1] ?? 'bot').toLowerCase()

/** 테스트와 진단에서 쓸 수 있게 노출한다 */
export function uaToken(): string {
  return UA_TOKEN
}

export interface HttpOptions {
  /** 같은 호스트에 대한 최소 요청 간격(ms) */
  minIntervalMs?: number
  timeoutMs?: number
  maxRetries?: number
  headers?: Record<string, string>
  /** robots.txt 검사 생략 (공개 API 엔드포인트 등) */
  skipRobots?: boolean
  /**
   * 호출자가 포기했을 때 요청을 실제로 끊기 위한 신호.
   * 이게 없으면 타임아웃은 기다림만 포기하고 요청은 계속 살아 있어,
   * 호스트 큐를 계속 붙잡은 채 뒤따르는 검색까지 밀어버린다.
   */
  signal?: AbortSignal
}

const DEFAULTS = { minIntervalMs: 1200, timeoutMs: 20_000, maxRetries: 3 }

/** 호스트별 직렬 큐 — 동시성 1을 보장한다 */
const hostQueues = new Map<string, Promise<unknown>>()
const lastHit = new Map<string, number>()
const robotsCache = new Map<string, Promise<RobotsRules | null>>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class HttpError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export class AbortError extends Error {
  constructor(readonly url: string) {
    super(`요청이 취소되었습니다: ${url}`)
    this.name = 'AbortError'
  }
}

export class RobotsBlockedError extends Error {
  constructor(readonly url: string) {
    super(`robots.txt 가 막은 경로입니다: ${url}`)
    this.name = 'RobotsBlockedError'
  }
}

async function loadRobots(origin: string): Promise<RobotsRules | null> {
  const cached = robotsCache.get(origin)
  if (cached) return cached
  const p = (async () => {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return null
      return parseRobots(await res.text(), UA_TOKEN)
    } catch {
      return null
    }
  })()
  robotsCache.set(origin, p)
  return p
}

/** 호스트별 직렬 실행 + 최소 간격 보장 */
function enqueue<T>(host: string, minIntervalMs: number, fn: () => Promise<T>): Promise<T> {
  const prev = hostQueues.get(host) ?? Promise.resolve()
  const next = prev.then(async () => {
    const last = lastHit.get(host) ?? 0
    const wait = last + minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    try {
      return await fn()
    } finally {
      lastHit.set(host, Date.now())
    }
  })
  hostQueues.set(
    host,
    next.catch(() => undefined),
  )
  return next
}

export interface FetchStats {
  requests: number
  retries: number
  failures: number
  bytes: number
}

export const stats: FetchStats = { requests: 0, retries: 0, failures: 0, bytes: 0 }

export function resetStats(): void {
  stats.requests = 0
  stats.retries = 0
  stats.failures = 0
  stats.bytes = 0
}

/** 재시도·레이트리밋·robots 검사를 거친 텍스트 GET */
export async function fetchText(url: string, opts: HttpOptions = {}): Promise<string> {
  const o = { ...DEFAULTS, ...opts }
  const u = new URL(url)

  if (!o.skipRobots) {
    const rules = await loadRobots(u.origin)
    if (rules && !isAllowed(rules, u.pathname + u.search)) throw new RobotsBlockedError(url)
    if (rules?.crawlDelayMs && rules.crawlDelayMs > o.minIntervalMs) o.minIntervalMs = rules.crawlDelayMs
  }

  return enqueue(u.host, o.minIntervalMs, async () => {
    let lastErr: unknown
    for (let attempt = 0; attempt <= o.maxRetries; attempt++) {
      if (o.signal?.aborted) throw new AbortError(url)
      if (attempt > 0) {
        stats.retries++
        await sleep(1000 * 3 ** (attempt - 1))
      }
      try {
        stats.requests++
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9',
            ...o.headers,
          },
          redirect: 'follow',
          signal: o.signal
            ? AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs)])
            : AbortSignal.timeout(o.timeoutMs),
        })
        // 4xx 는 우리 잘못이거나 차단이다. 재시도해도 소용없고 상대에게 민폐다.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new HttpError(`HTTP ${res.status}`, res.status, url)
        }
        if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, url)
        const text = await res.text()
        stats.bytes += text.length
        return text
      } catch (err) {
        lastErr = err
        // 호출자가 포기한 요청을 재시도하는 것은 남의 서버에 대한 순수한 민폐다
        if (o.signal?.aborted) throw new AbortError(url)
        if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) break
      }
    }
    stats.failures++
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  })
}

export async function fetchJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<T> {
  const txt = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...opts.headers } })
  return JSON.parse(txt) as T
}
