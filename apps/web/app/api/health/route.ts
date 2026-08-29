import { NextResponse } from 'next/server'
import { hasDb, indexStats, sourceHealthSummary } from '@eodi/db'
import { allAdapters } from '@eodi/crawler'

export const dynamic = 'force-dynamic'

/** 배포 후 30초 안에 "잘 살아 있는지" 확인할 수 있어야 한다 */
export async function GET() {
  const [index, health] = await Promise.all([indexStats(), sourceHealthSummary(24)])
  return NextResponse.json({
    ok: true,
    db: hasDb(),
    adapters: allAdapters().map((a) => ({
      id: a.id,
      label: a.label,
      enabled: a.enabled,
      ...(a.disabledReason ? { disabledReason: a.disabledReason } : {}),
    })),
    index,
    sourceHealth: health,
    now: new Date().toISOString(),
  })
}
