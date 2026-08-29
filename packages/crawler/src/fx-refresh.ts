import { setFxRate, getFxRate, DEFAULT_JPY_KRW, type FxRate } from '@eodi/core'

/**
 * 환율 갱신.
 *
 * 환율 때문에 검색이 실패하면 안 되므로 실패는 전부 삼키고 마지막 값을 유지한다.
 * 하루 한 번이면 충분하다 — 중고 매물 가격 비교에 소수점 환율 정밀도는 의미가 없다.
 */
const SOURCES = [
  {
    url: 'https://api.frankfurter.dev/v1/latest?base=JPY&symbols=KRW',
    pick: (j: unknown) => {
      const d = j as { rates?: { KRW?: number }; date?: string }
      return d.rates?.KRW ? { jpyToKrw: d.rates.KRW, asOf: d.date ?? '' } : null
    },
  },
  {
    url: 'https://open.er-api.com/v6/latest/JPY',
    pick: (j: unknown) => {
      const d = j as { rates?: { KRW?: number }; time_last_update_utc?: string }
      return d.rates?.KRW ? { jpyToKrw: d.rates.KRW, asOf: d.time_last_update_utc ?? '' } : null
    },
  },
]

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
let lastAttempt = 0
let inflight: Promise<FxRate> | null = null

async function fetchOnce(): Promise<FxRate | null> {
  for (const s of SOURCES) {
    try {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(8000), redirect: 'follow' })
      if (!res.ok) continue
      const picked = s.pick(await res.json())
      if (picked && Number.isFinite(picked.jpyToKrw) && picked.jpyToKrw > 0) {
        // 상식 범위를 벗어난 값은 API 가 이상해진 것이다. 받지 않는다.
        if (picked.jpyToKrw < 3 || picked.jpyToKrw > 30) continue
        return { jpyToKrw: Number(picked.jpyToKrw.toFixed(4)), asOf: picked.asOf || new Date().toISOString() }
      }
    } catch {
      // 다음 소스로
    }
  }
  return null
}

/** 필요할 때만 갱신한다. 이미 최근에 받았으면 그대로 쓴다. */
export async function ensureFxRate(force = false): Promise<FxRate> {
  const now = Date.now()
  if (!force && now - lastAttempt < REFRESH_INTERVAL_MS) return getFxRate()
  if (inflight) return inflight

  lastAttempt = now
  inflight = (async () => {
    const rate = await fetchOnce()
    if (rate) setFxRate(rate)
    else if (getFxRate().asOf === 'default') {
      console.warn(`[fx] 환율 조회 실패. 기본값 ${DEFAULT_JPY_KRW} 을 씁니다.`)
    }
    inflight = null
    return getFxRate()
  })()
  return inflight
}
