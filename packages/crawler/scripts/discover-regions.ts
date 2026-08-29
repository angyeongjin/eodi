/**
 * 당근마켓 지역 카탈로그 생성기.
 *
 * 지역 ID 목록은 당근이 robots.txt 로 공개한 사이트맵에서 얻고,
 * 각 ID 의 시/도/구 이름은 해당 페이지 1회 조회로 확인한다.
 * 결과는 data/daangn-regions.json 에 커밋되어 런타임에는 네트워크가 필요 없다.
 *
 *   npx tsx scripts/discover-regions.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchText, USER_AGENT } from '../src/http.js'

const SITEMAP = 'https://www.daangn.com/sitemap/kr/buy-sell/sitemap-popular-keywords.xml.gz'

interface RegionRow {
  id: number
  name: string
  province: string
  city: string
  dong: string
  slug: string
}

console.log('사이트맵 내려받는 중...')
const res = await fetch(SITEMAP, { headers: { 'User-Agent': USER_AGENT } })
const body = Buffer.from(await res.arrayBuffer())
// fetch 가 Content-Encoding: gzip 을 이미 풀어주는 경우가 있어 둘 다 대응한다
const xml = body[0] === 0x1f && body[1] === 0x8b
  ? gunzipSync(body).toString('utf-8')
  : body.toString('utf-8')

const regionIds = new Map<number, string>()
const keywords = new Map<string, number>()
for (const m of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
  const u = new URL(m[1]!.replace(/&amp;/g, '&'))
  const inParam = u.searchParams.get('in')
  if (inParam) {
    const at = inParam.lastIndexOf('-')
    const id = Number(inParam.slice(at + 1))
    if (Number.isInteger(id)) regionIds.set(id, inParam.slice(0, at))
  }
  const s = u.searchParams.get('search')
  if (s) keywords.set(s, (keywords.get(s) ?? 0) + 1)
}
console.log(`지역 ${regionIds.size}개 / 키워드 ${keywords.size}개 발견`)

const REGION_RE =
  /"region":\{"id":"(\d+)","name":"([^"]*)","depth1RegionName":"([^"]*)","depth2RegionName":"([^"]*)","depth3RegionName":"([^"]*)"\}/

const rows: RegionRow[] = []
let i = 0
for (const [id, slugName] of [...regionIds].sort((a, b) => a[0] - b[0])) {
  i++
  try {
    const html = await fetchText(
      `https://www.daangn.com/kr/buy-sell/?in=${encodeURIComponent(`${slugName}-${id}`)}`,
    )
    const m = html.match(REGION_RE)
    if (!m) {
      console.log(`  [${i}/${regionIds.size}] ${id} 지역 정보 없음`)
      continue
    }
    const row: RegionRow = {
      id: Number(m[1]),
      name: m[2]!,
      province: m[3]!,
      city: m[4]!,
      dong: m[5]!,
      slug: `${slugName}-${id}`,
    }
    rows.push(row)
    console.log(`  [${i}/${regionIds.size}] ${row.province} ${row.city} ${row.dong}`)
  } catch (err) {
    console.log(`  [${i}/${regionIds.size}] ${id} 실패: ${err instanceof Error ? err.message : err}`)
  }
}

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(resolve(here, '../data'), { recursive: true })

rows.sort((a, b) => a.province.localeCompare(b.province) || a.city.localeCompare(b.city))
writeFileSync(resolve(here, '../data/daangn-regions.json'), JSON.stringify(rows, null, 2) + '\n')

const kwSorted = [...keywords.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
writeFileSync(resolve(here, '../data/seed-keywords.json'), JSON.stringify(kwSorted, null, 2) + '\n')

writeFileSync(
  resolve(here, '../src/regions.data.ts'),
  `// 이 파일은 scripts/discover-regions.ts 가 생성합니다. 직접 수정하지 마세요.\n` +
    `import type { Region } from './regions.js'\n\n` +
    `export const REGION_DATA: Region[] = ${JSON.stringify(rows, null, 2)}\n\n` +
    `/** 당근이 사이트맵으로 공개한 인기 검색어. 예열과 SEO 랜딩의 시드. */\n` +
    `export const SEED_KEYWORDS: string[] = ${JSON.stringify(kwSorted, null, 2)}\n`,
)

console.log(`\n지역 ${rows.length}개, 키워드 ${kwSorted.length}개 저장 완료`)
