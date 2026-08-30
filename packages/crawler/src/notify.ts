/**
 * 운영 알림.
 *
 * 사람이 /status 를 들여다봐야만 이상을 알 수 있으면, 아무도 모르는 채로 하루가 간다.
 * 디스코드 웹훅 하나면 충분하다 — 계정도 서버도 필요 없다.
 *
 * 웹훅 URL 은 비밀값이다. 아는 사람은 우리 채널에 아무 글이나 올릴 수 있다.
 * 로그에 찍지 않는다.
 */
import { envStr } from '@eodi/core'

export interface DiscordMessage {
  title: string
  lines: string[]
  /** 초록·노랑·빨강 */
  level: 'ok' | 'warn' | 'danger'
  url?: string
}

const COLOR = { ok: 0x2ecc71, warn: 0xf1c40f, danger: 0xe74c3c }

/** 웹훅이 설정돼 있는지. 없으면 조용히 넘어간다 — 알림이 없다고 점검이 실패하면 안 된다 */
export function hasDiscord(): boolean {
  return Boolean(envStr('DISCORD_WEBHOOK_URL', ''))
}

export async function sendDiscord(msg: DiscordMessage): Promise<boolean> {
  const url = envStr('DISCORD_WEBHOOK_URL', '')
  if (!url) return false
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
    // 엉뚱한 곳으로 운영 정보를 보내지 않는다
    console.warn('[notify] DISCORD_WEBHOOK_URL 형식이 디스코드 웹훅이 아닙니다')
    return false
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '어디있지 운영',
        embeds: [
          {
            title: msg.title,
            description: msg.lines.join('\n').slice(0, 3800),
            color: COLOR[msg.level],
            ...(msg.url ? { url: msg.url } : {}),
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // 본문에 웹훅 URL 이 들어갈 일은 없지만, 상태 코드만 남긴다
      console.warn(`[notify] 디스코드 발송 실패 HTTP ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[notify] 디스코드 발송 실패:', err instanceof Error ? err.message : String(err))
    return false
  }
}
