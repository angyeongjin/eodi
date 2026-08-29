import webpush, { WebPushError } from 'web-push'
import { envStr, isAllowedEndpoint, type NotificationPayload } from '@eodi/core'
import type { PushSubscriptionJson } from '@eodi/db'

/**
 * 웹 푸시 발송.
 *
 * 앱스토어도, 서버 상주 프로세스도 필요 없다.
 * 브라우저 벤더의 푸시 서비스(FCM / Mozilla / Apple)에 우리가 서명한 요청을 보내면 끝이고,
 * 그 서비스들은 무료다. 그래서 알림 기능 전체가 0원으로 돌아간다.
 */

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export function readVapid(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  return {
    publicKey,
    privateKey,
    // 푸시 서비스가 문제 발생 시 연락할 곳. mailto: 또는 https: 여야 한다.
    subject: envStr('VAPID_SUBJECT', 'mailto:hello@eodizzi.com'),
  }
}

let configured = false
function ensureConfigured(v: VapidConfig): void {
  if (configured) return
  webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey)
  configured = true
}

export { isAllowedEndpoint }

export type SendResult =
  | { ok: true }
  | { ok: false; gone: boolean; error: string }

export async function sendPush(
  subscription: PushSubscriptionJson,
  payload: NotificationPayload,
  vapid: VapidConfig,
): Promise<SendResult> {
  if (!isAllowedEndpoint(subscription.endpoint)) {
    return { ok: false, gone: true, error: '허용되지 않은 푸시 엔드포인트' }
  }
  ensureConfigured(vapid)
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 6 * 60 * 60, // 6시간. 그보다 오래된 중고 매물 알림은 이미 늦었다.
      urgency: 'normal',
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof WebPushError) {
      // 410 Gone / 404 Not Found = 구독이 죽었다. 다시 시도하면 안 된다.
      const gone = err.statusCode === 410 || err.statusCode === 404
      return { ok: false, gone, error: `HTTP ${err.statusCode}` }
    }
    return { ok: false, gone: false, error: err instanceof Error ? err.message : String(err) }
  }
}
