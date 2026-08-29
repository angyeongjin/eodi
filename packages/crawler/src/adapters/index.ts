import { envList, type MarketScope, type SourceId } from '@eodi/core'
import type { SourceAdapter } from '../types.js'
import { bunjangAdapter } from './bunjang.js'
import { daangnAdapter } from './daangn.js'
import { joongnaAdapter } from './joongna.js'
import { hellomarketAdapter } from './hellomarket.js'
import { yahooAuctionAdapter } from './yahoo.js'
import { mercariAdapter } from './mercari.js'

const ALL: SourceAdapter[] = [
  bunjangAdapter, daangnAdapter, joongnaAdapter, hellomarketAdapter,
  yahooAuctionAdapter, mercariAdapter,
]

/** 환경변수로 즉시 끌 수 있어야 한다 — 소스 측 요청에 바로 응하기 위한 kill switch */
function disabledByEnv(): Set<string> {
  return new Set(
    envList('DISABLED_SOURCES'),
  )
}

export function allAdapters(scope?: MarketScope): SourceAdapter[] {
  if (!scope) return ALL
  return ALL.filter((a) => (a.scope ?? 'domestic') === scope)
}

export function activeAdapters(scope?: MarketScope): SourceAdapter[] {
  const off = disabledByEnv()
  return allAdapters(scope).filter((a) => a.enabled && !off.has(a.id))
}

export function getAdapter(id: SourceId): SourceAdapter | undefined {
  return ALL.find((a) => a.id === id)
}

export {
  bunjangAdapter, daangnAdapter, joongnaAdapter, hellomarketAdapter,
  yahooAuctionAdapter, mercariAdapter,
}
