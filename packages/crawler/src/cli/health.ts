/**
 * 소스 건강 점검.
 *
 * 중고나라가 하루 종일 39% 였는데 아무도 몰랐다 — 사람이 /status 를 봐야만 알 수 있었다.
 * 나쁘면 실패로 끝나고(크론 실패가 곧 알림), 디스코드 웹훅이 있으면 함께 보낸다.
 *
 * 같은 경고를 여섯 시간마다 되풀이하지 않는다. 직전 구간과 비교해
 * **상태가 바뀐 것만** 알린다 — 매번 울리는 알림은 아무도 안 읽는다.
 *
 *   npx tsx src/cli/health.ts --hours=6
 */
import { sourceHealthSummary, closeSql, hasDb } from '@eodi/db'
import { SOURCE_LABEL } from '@eodi/core'
import { allAdapters } from '../adapters/index.js'
import { sendDiscord, hasDiscord } from '../notify.js'

const args = process.argv.slice(2)
const arg = (name: string, fallback: number): number => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  const n = hit ? Number(hit.split('=')[1]) : NaN
  return Number.isFinite(n) ? n : fallback
}

const hours = arg('hours', 6)
const DANGER = arg('danger', 50) / 100
const WARN = arg('warn', 80) / 100
/*
  표본이 적으면 판단하지 않는다.
  예열이 아직 안 돈 시간대에 한두 건 실패로 사람을 깨우면,
  다음부터 아무도 이 알림을 안 읽는다.
*/
const MIN_SAMPLES = arg('min-samples', 20)
/** 웹훅이 실제로 닿는지 확인할 때. 상태와 무관하게 한 번 보낸다 */
const PING = args.includes('--ping')

type Level = 'ok' | 'warn' | 'danger' | 'unknown'
const levelOf = (rate: number, samples: number): Level =>
  samples < MIN_SAMPLES ? 'unknown' : rate < DANGER ? 'danger' : rate < WARN ? 'warn' : 'ok'
const MARK: Record<Level, string> = { ok: '✅', warn: '🟡', danger: '🔴', unknown: '·' }

if (PING) {
  const sent = await sendDiscord({
    title: '알림 연결 확인',
    lines: ['어디있지 운영 알림이 이 채널로 옵니다.', '소스 상태가 **바뀔 때만** 보냅니다 — 같은 경고를 되풀이하지 않습니다.'],
    level: 'ok',
  })
  console.log(sent ? '디스코드 전송 성공' : '디스코드 전송 실패 (DISCORD_WEBHOOK_URL 확인)')
  process.exit(sent ? 0 : 1)
}

if (!hasDb()) {
  console.log('DATABASE_URL 이 없어 점검할 기록이 없습니다.')
  process.exit(0)
}

const now = await sourceHealthSummary(hours, 0)
const prev = await sourceHealthSummary(hours, hours)
const enabled = allAdapters('domestic')
  .concat(allAdapters('overseas'))
  .filter((a) => a.enabled)
  .map((a) => a.id)

console.log(`최근 ${hours}시간 소스 상태 (위험 ${Math.round(DANGER * 100)}% · 주의 ${Math.round(WARN * 100)}%)\n`)

const changed: string[] = []
const danger: string[] = []
const silent: string[] = []

for (const id of enabled) {
  const label = SOURCE_LABEL[id as keyof typeof SOURCE_LABEL] ?? id
  const n = now.find((x) => x.source === id)
  if (!n || n.samples === 0) {
    silent.push(label)
    console.log(`  ${label.padEnd(8)} 기록 없음`)
    continue
  }
  const pct = Math.round(n.okRate * 100)
  const lvl = levelOf(n.okRate, n.samples)
  console.log(
    `  ${label.padEnd(8)} ${MARK[lvl]} ${String(pct).padStart(3)}%  (${Math.round(n.okRate * n.samples)}/${n.samples})` +
      `  ${Math.round(n.avgDurationMs)}ms` +
      (n.lastError ? `  최근오류: ${n.lastError.slice(0, 40)}` : ''),
  )
  if (lvl === 'danger') danger.push(`${label} ${pct}%`)

  const p = prev.find((x) => x.source === id)
  const before: Level = p && p.samples > 0 ? levelOf(p.okRate, p.samples) : 'unknown'
  if (before === lvl || lvl === 'unknown') continue
  const beforePct = p ? `${Math.round(p.okRate * 100)}%` : '기록없음'
  if (lvl === 'ok') changed.push(`✅ **${label}** 복구 — ${beforePct} → ${pct}%`)
  else changed.push(`${MARK[lvl]} **${label}** ${lvl === 'danger' ? '장애' : '주의'} — ${beforePct} → ${pct}%${n.lastError ? ` (${n.lastError.slice(0, 40)})` : ''}`)
}

console.log()
if (silent.length) console.log(`기록 없음: ${silent.join(', ')} — 예열 크론이 돌았는지 확인하세요`)
if (danger.length) console.log(`위험: ${danger.join(' · ')}`)
if (!danger.length && !silent.length) console.log('모든 소스 정상')

/*
  바뀐 것이 있을 때만 보낸다.
  "여전히 나쁨" 을 여섯 시간마다 보내면 사람은 채널을 음소거한다.
*/
if (changed.length > 0 && hasDiscord()) {
  const worst = changed.some((c) => c.startsWith('🔴')) ? 'danger' : changed.some((c) => c.startsWith('🟡')) ? 'warn' : 'ok'
  const sent = await sendDiscord({
    title: `소스 상태 변화 (최근 ${hours}시간)`,
    lines: changed,
    level: worst,
    url: process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/status` : undefined,
  })
  console.log(sent ? `디스코드 알림 ${changed.length}건 전송` : '디스코드 알림 전송 실패')
} else if (changed.length > 0) {
  console.log(`상태 변화 ${changed.length}건 (디스코드 미설정)`)
  for (const c of changed) console.log(`  ${c.replace(/\*\*/g, '')}`)
} else {
  console.log('직전 구간과 상태 변화 없음')
}

await closeSql()
process.exit(danger.length > 0 ? 1 : 0)
