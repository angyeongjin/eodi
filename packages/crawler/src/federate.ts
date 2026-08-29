import { envNum, type MarketScope, type RawListing, type SourceId, type SourceStatus } from '@eodi/core'
import { activeAdapters, allAdapters } from './adapters/index.js'
import type { SourceAdapter } from './types.js'

export interface FederateOptions {
  /** 소스당 최대 수집 건수 */
  limitPerSource?: number
  /** 소스당 제한 시간. 넘으면 그 소스는 버리고 나머지로 응답한다 */
  timeoutMs?: number
  /** 특정 소스만 질의 */
  only?: SourceId[]
  sort?: 'recent' | 'relevance'
  /** 지역 스코프 소스에 넘길 지역 slug */
  regionSlug?: string
  /** 소스당 최대 HTTP 요청 수. 대화형은 1, 예열은 크게 */
  maxRequests?: number
  /** 국내/해외. 지정하면 그 시장의 소스만 질의한다 */
  scope?: MarketScope
  /** 테스트·특수 목적으로 어댑터 집합을 직접 주입 */
  adapters?: SourceAdapter[]
}

export interface FederateResult {
  listings: RawListing[]
  statuses: SourceStatus[]
}

/**
 * 소스당 100건 = 번개장터 기준 요청 1회.
 * 150 으로 잡으면 페이지를 하나 더 넘기느라 레이트리밋 대기 1.2초가 그대로 응답 지연이 된다.
 */
/**
 * 소스당 제한 시간.
 *
 * 넉넉하게 잡으면 느린 소스 하나 때문에 사용자가 그만큼 빈 화면을 본다.
 * 우리는 부분 응답을 허용하므로, 기다리는 것보다 "그 소스는 빠졌다"고 말하는 편이 낫다.
 *
 * 다만 이 시간에는 **우리 레이트리밋 큐 대기도 포함된다.**
 * 같은 호스트로 검색이 연달아 들어오면 호스트당 최소 간격(1.2초)만큼 줄을 서므로,
 * 소스가 멀쩡해도 (대기 1.2s × 2) + 응답 1.4s ≈ 4초가 나온다.
 * 실측 응답이 0.7~1.4초인데 4.5초로 잡았더니 멀쩡한 야후옥션이 "장애"로 찍혔다.
 * 큐 대기를 감안해 6초로 둔다.
 */
const DEFAULTS = {
  limitPerSource: 100,
  timeoutMs: envNum('SOURCE_TIMEOUT_MS', 6000),
  maxRequests: 1,
}

/**
 * 제한 시간 안에 못 오면 포기한다.
 *
 * 중요한 건 **기다림을 포기하는 것으로 끝내지 않는 것**이다.
 * 취소 신호를 실제 요청까지 내려보내지 않으면, 죽은 요청이 호스트 큐를 계속 붙잡아
 * 뒤따르는 검색이 전부 이 시간만큼 밀린다(실제로 8초짜리 응답이 줄줄이 나왔다).
 */
function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const ctrl = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      ctrl.abort()
      reject(new Error(`${label} 응답 시간 초과 (${ms}ms)`))
    }, ms)
    run(ctrl.signal).then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function runOne(
  adapter: SourceAdapter,
  term: string,
  o: Required<Pick<FederateOptions, 'limitPerSource' | 'timeoutMs' | 'maxRequests'>> & {
    sort?: 'recent' | 'relevance'
    regionSlug?: string
  },
): Promise<{ listings: RawListing[]; status: SourceStatus }> {
  const started = Date.now()
  try {
    const listings = await withTimeout(
      (signal) =>
        adapter.search(term, {
          limit: o.limitPerSource,
          maxRequests: o.maxRequests,
          sort: o.sort ?? 'relevance',
          signal,
          ...(o.regionSlug ? { regionSlug: o.regionSlug } : {}),
        }),
      o.timeoutMs,
      adapter.label,
    )
    return {
      listings,
      status: { source: adapter.id, ok: true, count: listings.length, durationMs: Date.now() - started },
    }
  } catch (err) {
    return {
      listings: [],
      status: {
        source: adapter.id,
        ok: false,
        count: 0,
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/**
 * 모든 활성 소스에 같은 질의를 동시에 던진다.
 *
 * 원칙: **한 소스가 죽어도 검색은 성공한다.** 실패는 결과가 아니라 상태로 보고된다.
 */
export async function federate(term: string, opts: FederateOptions = {}): Promise<FederateResult> {
  const o = { ...DEFAULTS, ...opts }
  let adapters = opts.adapters ?? activeAdapters(opts.scope)
  if (opts.only?.length) adapters = adapters.filter((a) => opts.only!.includes(a.id))

  const settled = await Promise.all(adapters.map((a) => runOne(a, term, o)))

  const listings = settled.flatMap((s) => s.listings)
  const statuses = settled.map((s) => s.status)

  // 꺼져 있는 소스도 상태로는 보고한다 — 사용자가 "왜 중고나라가 없지" 를 알 수 있어야 한다
  for (const a of opts.adapters ?? allAdapters(opts.scope)) {
    if (statuses.some((s) => s.source === a.id)) continue
    statuses.push({
      source: a.id,
      ok: false,
      disabled: true,
      count: 0,
      durationMs: 0,
      error: a.disabledReason ?? '지금은 지원하지 않는 마켓입니다',
    })
  }

  return { listings, statuses }
}
