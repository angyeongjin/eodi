/**
 * 소스 건강 점검.
 *
 * 중고나라가 하루 종일 39% 였는데 아무도 몰랐다 — /status 를 사람이 봐야만 알 수 있었다.
 * 이 명령은 나쁠 때 실패로 끝난다. 크론이 실패하면 GitHub 이 저장소 주인에게 메일을 보낸다.
 * 알림 채널을 새로 만들지 않고 이미 있는 것으로 알린다.
 *
 *   npx tsx src/cli/health.ts --hours=6
 */
import { sourceHealthSummary, closeSql, hasDb } from '@eodi/db'
import { SOURCE_LABEL } from '@eodi/core'
import { allAdapters } from '../adapters/index.js'

const args = process.argv.slice(2)
const arg = (name: string, fallback: number): number => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  const n = hit ? Number(hit.split('=')[1]) : NaN
  return Number.isFinite(n) ? n : fallback
}

const hours = arg('hours', 6)
/** 이 아래면 사실상 죽은 것이다 */
const DANGER = arg('danger', 50) / 100
/** 이 아래면 눈여겨봐야 한다 */
const WARN = arg('warn', 80) / 100
/*
  표본이 적으면 판단하지 않는다.
  예열이 아직 안 돈 시간대에 한두 건 실패한 것으로 사람을 깨우면,
  다음부터 아무도 이 알림을 안 읽는다.
*/
const MIN_SAMPLES = arg('min-samples', 20)

if (!hasDb()) {
  console.log('DATABASE_URL 이 없어 점검할 기록이 없습니다.')
  process.exit(0)
}

const rows = await sourceHealthSummary(hours)
const enabled = new Set(allAdapters('domestic').concat(allAdapters('overseas')).filter((a) => a.enabled).map((a) => a.id))

console.log(`최근 ${hours}시간 소스 상태 (위험 ${Math.round(DANGER * 100)}% · 주의 ${Math.round(WARN * 100)}%)\n`)

const danger: string[] = []
const warn: string[] = []
const silent: string[] = []

for (const id of enabled) {
  const r = rows.find((x) => x.source === id)
  const label = SOURCE_LABEL[id as keyof typeof SOURCE_LABEL] ?? id
  if (!r || r.samples === 0) {
    // 아예 호출되지 않았다면 예열이 안 돌았거나 어댑터가 빠진 것이다
    silent.push(label)
    console.log(`  ${label.padEnd(8)} 기록 없음`)
    continue
  }
  const pct = Math.round(r.okRate * 100)
  const mark = r.okRate < DANGER ? '🔴' : r.okRate < WARN ? '🟡' : '✅'
  console.log(
    `  ${label.padEnd(8)} ${mark} ${String(pct).padStart(3)}%  (${Math.round(r.okRate * r.samples)}/${r.samples})` +
      `  ${Math.round(r.avgDurationMs)}ms` +
      (r.lastError ? `  최근오류: ${r.lastError.slice(0, 40)}` : ''),
  )
  if (r.samples < MIN_SAMPLES) continue
  if (r.okRate < DANGER) danger.push(`${label} ${pct}%`)
  else if (r.okRate < WARN) warn.push(`${label} ${pct}%`)
}

console.log()
if (silent.length) console.log(`기록 없음: ${silent.join(', ')} — 예열 크론이 돌았는지 확인하세요`)
if (warn.length) console.log(`주의: ${warn.join(' · ')}`)
if (danger.length) console.log(`위험: ${danger.join(' · ')}`)
if (!danger.length && !warn.length && !silent.length) console.log('모든 소스 정상')

await closeSql()
// 위험한 소스가 있으면 실패로 끝낸다. 크론 실패가 곧 알림이다.
process.exit(danger.length > 0 ? 1 : 0)
