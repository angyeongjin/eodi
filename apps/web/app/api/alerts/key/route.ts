import { NextResponse } from 'next/server'

/** 브라우저가 푸시를 구독할 때 필요한 공개키. 공개돼도 되는 값이다. */
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? ''
  return NextResponse.json(
    { publicKey },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}
