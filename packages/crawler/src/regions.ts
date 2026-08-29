import { envStr } from '@eodi/core'
import { REGION_DATA } from './regions.data.js'

export { SEED_KEYWORDS } from './regions.data.js'

export interface Region {
  id: number
  name: string
  province: string
  city: string
  dong: string
  /** 당근 URL 의 in= 값 */
  slug: string
}

export const REGIONS: Region[] = REGION_DATA

/** 지역 미선택 시 기본값 — 매물 밀도가 가장 높은 곳 */
export const DEFAULT_REGION_SLUG = envStr(
  'DEFAULT_REGION_SLUG',
  REGIONS.find((r) => r.dong === '역삼동')?.slug ?? REGIONS[0]?.slug ?? '',
)

export function findRegion(slug: string | undefined): Region | undefined {
  if (!slug) return undefined
  return REGIONS.find((r) => r.slug === slug)
}

/** 시·도 → 지역 목록 (지역 선택 UI 용) */
export function regionsByProvince(): Array<{ province: string; regions: Region[] }> {
  const map = new Map<string, Region[]>()
  for (const r of REGIONS) {
    const arr = map.get(r.province)
    if (arr) arr.push(r)
    else map.set(r.province, [r])
  }
  return [...map.entries()]
    .map(([province, regions]) => ({
      province,
      regions: regions.sort((a, b) => a.city.localeCompare(b.city) || a.dong.localeCompare(b.dong)),
    }))
    .sort((a, b) => a.province.localeCompare(b.province))
}

/**
 * 백그라운드 예열이 돌 지역 집합.
 * 실시간 검색은 한 지역만 보지만, 예열이 여러 지역을 돌며 우리 인덱스를 넓혀준다.
 */
export function prewarmRegions(limit = 12): Region[] {
  // 시·도별로 골고루 뽑아 한 지역에 쏠리지 않게 한다
  const byProvince = regionsByProvince()
  const out: Region[] = []
  let round = 0
  while (out.length < limit) {
    let added = false
    for (const g of byProvince) {
      const r = g.regions[round]
      if (r) {
        out.push(r)
        added = true
        if (out.length >= limit) break
      }
    }
    if (!added) break
    round++
  }
  return out
}
