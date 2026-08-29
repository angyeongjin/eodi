/**
 * 키워드 알림 실행.
 *
 * 저장된 검색을 하나씩 돌려 "이미 알린 적 없는 매물"만 골라 푸시한다.
 * 크론이 부르는 백그라운드 작업이라 느려도 되고, 실패해도 다음 회차가 있다.
 *
 *   npx tsx src/cli/run-alerts.ts --limit=100
 */
import { diffAlert, buildNotification, envStr } from '@eodi/core'
import { dueAlerts, markChecked, markFailed, alertStats, closeSql, hasDb } from '@eodi/db'
import { search } from '../service.js'
import { readVapid, sendPush } from '../push.js'

function arg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const siteUrl = envStr('NEXT_PUBLIC_SITE_URL', 'https://eodizzi.com')
const limit = arg('limit', 100)
const dryRun = process.argv.includes('--dry-run')

if (!hasDb()) {
  console.log('DATABASE_URL 이 없어 알림을 실행할 수 없습니다.')
  process.exit(0)
}
const vapid = readVapid()
if (!vapid && !dryRun) {
  console.error('VAPID 키가 없습니다. `npm run vapid -w @eodi/crawler` 로 만들어 환경변수에 넣으세요.')
  process.exit(1)
}

const alerts = await dueAlerts(limit)
console.log(`알림 ${alerts.length}건 확인${dryRun ? ' (드라이런)' : ''}`)

let notified = 0
let failed = 0
let freshTotal = 0

for (const a of alerts) {
  try {
    const res = await search(
      { q: a.term, scope: a.scope, filters: a.filters, perPage: 30 },
      // 알림 확인도 사용자가 친 검색이 아니다 (계측 분모에서 제외)
      { background: true, federate: { timeoutMs: 12_000 } },
    )
    /*
      처음 등록한 알림은 기존 매물을 쏟아내지 않는다. 현재 목록을 기억만 하고 넘어간다.

      판정 근거는 "한 번이라도 확인했는가"(last_checked_at)여야 한다.
      seen_ids 가 비었는지로 보면, 며칠간 결과가 0건이던 희귀 매물이 처음 떴을 때
      그걸 "첫 실행"으로 오인해 **알림을 삼켜버린다.** 사용자가 가장 기다린 그 순간에.
    */
    const firstRun = a.lastCheckedAt === null
    const match = diffAlert(
      { id: a.id, term: a.term, scope: a.scope, filters: a.filters, seenIds: a.seenIds },
      res.items,
      { firstRun },
    )
    freshTotal += match.fresh.length

    const payload = buildNotification(match, siteUrl)
    if (!payload || dryRun) {
      if (!dryRun) await markChecked(a.id, match.nextSeenIds, false)
      console.log(
        `  [${a.id}] ${a.term.padEnd(16).slice(0, 16)} ${a.scope === 'overseas' ? '일본' : '국내'} ` +
          `→ 새 매물 ${match.fresh.length}건${firstRun ? ' (첫 실행: 기억만)' : ''}${dryRun ? '' : ' · 발송 안 함'}`,
      )
      continue
    }

    const sent = await sendPush(a.subscription, payload, vapid!)
    if (sent.ok) {
      await markChecked(a.id, match.nextSeenIds, true)
      notified++
      console.log(`  [${a.id}] ${a.term.slice(0, 16)} → ${match.fresh.length}건 발송`)
    } else {
      failed++
      await markFailed(a.id, sent.gone)
      console.log(`  [${a.id}] ${a.term.slice(0, 16)} → 발송 실패 ${sent.error}${sent.gone ? ' (구독 해제)' : ''}`)
    }
  } catch (err) {
    failed++
    console.log(`  [${a.id}] 오류: ${err instanceof Error ? err.message : err}`)
  }
}

const stats = await alertStats()
console.log(
  `\n완료 — 발송 ${notified}건 · 실패 ${failed}건 · 새 매물 합계 ${freshTotal}건` +
    `\n등록된 알림 ${stats.active}/${stats.total}개 · 최근 24시간 발송 ${stats.notified24h}개`,
)
await closeSql()
