import { NextResponse } from 'next/server'
import { suggest } from '@eodi/crawler'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const items = await suggest(q.slice(0, 60), 8)
  return NextResponse.json(
    { items },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
  )
}
