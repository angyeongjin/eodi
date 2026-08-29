/**
 * 메루카리 백그라운드 수집기.
 *
 * 메루카리는 HTTP 요청만으로는 읽히지 않는다(검색 결과 미렌더 + API 401).
 * 그래서 실제 브라우저로 공개 검색 페이지를 열어 렌더된 목록을 읽는다.
 * 사용자 요청 경로가 아니라 크론이 도는 백그라운드 작업이라 느려도 된다.
 *
 * 지키는 것:
 *  - 로그인하지 않는다. 누구에게나 공개된 페이지만 연다.
 *  - 키워드 사이에 간격을 둔다. 병렬로 때리지 않는다.
 *  - 실패하면 조용히 넘어간다. 이 소스가 죽어도 검색은 계속 동작해야 한다.
 *
 *   npx tsx src/cli/crawl-mercari.ts --keywords=20 --pages=1
 */
import puppeteer, { type Browser } from 'puppeteer-core'
import { enrichAll, ProductMatcher, CATALOG, type CatalogProduct, type RawListing } from '@eodi/core'
import { upsertListings, closeSql, hasDb } from '@eodi/db'
import { toMercariListing, type MercariScraped } from '../adapters/mercari.js'
import { GOODS_TERMS, envNum, envOptional } from '@eodi/core'
import { ensureFxRate } from '../fx-refresh.js'

const SEARCH_URL = (kw: string) => `https://jp.mercari.com/search?keyword=${encodeURIComponent(kw)}`
/** 키워드 사이 간격 — 남의 서버에 몰아치지 않는다 */
const GAP_MS = envNum('MERCARI_GAP_MS', 4000)

function arg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** 설치된 크롬을 찾는다. 브라우저를 따로 내려받지 않는다. */
function chromePath(): string {
  const custom = envOptional('CHROME_PATH')
  if (custom) return custom
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return '/usr/bin/google-chrome'
}

async function scrapeKeyword(browser: Browser, keyword: string): Promise<MercariScraped[]> {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 1280, height: 1600 })
    await page.goto(SEARCH_URL(keyword), { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForSelector('[data-testid="item-cell"]', { timeout: 20_000 })

    // 목록은 스크롤해야 채워진다. 끝까지 훑어 내려간다.
    let lastCount = 0
    for (let i = 0; i < 10; i++) {
      const count = await page.$$eval('[data-testid="item-cell"]', (els) => els.length)
      const filled = await page.$$eval('[data-testid="item-cell"] [aria-label]', (els) => els.length)
      if (filled >= count && count === lastCount) break
      lastCount = count
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2))
      await new Promise((r) => setTimeout(r, 700))
    }

    const scraped = await page.$$eval('[data-testid="item-cell"]', (cells) =>
      cells
        .map((cell) => {
          const a = cell.querySelector('a[href^="/item/"]')
          const id = a?.getAttribute('href')?.split('/').pop() ?? ''
          const thumb = cell.querySelector('[role="img"][aria-label]')
          const label = thumb?.getAttribute('aria-label') ?? ''
          // "○○의 이미지 2,199円 KRW20,115" 형태
          const m = label.match(/^(.*?)の画像\s*([\d,]+)円/)
          const img = cell.querySelector('img')?.getAttribute('src') ?? undefined
          const sold = /売り切れ/.test(cell.textContent ?? '')
          if (!id || !m) return null
          return {
            id,
            title: (m[1] ?? '').trim(),
            price: Number((m[2] ?? '').replace(/,/g, '')),
            sold,
            thumbnailUrl: img ?? undefined,
          }
        })
        .filter((x) => x !== null),
    )
    return scraped
      .filter((x) => x !== null && x.price > 0)
      .map<MercariScraped>((x) => ({
        id: x!.id,
        title: x!.title,
        price: x!.price,
        sold: x!.sold,
        ...(x!.thumbnailUrl ? { thumbnailUrl: x!.thumbnailUrl } : {}),
      }))
  } finally {
    await page.close().catch(() => undefined)
  }
}

/** 굿즈 사전의 일본어 표제어가 곧 수집 키워드다 */
export function crawlKeywords(limit: number): string[] {
  const preferred = GOODS_TERMS.filter((t) => t.kind === 'ip').map((t) => t.ja)
  const category = GOODS_TERMS.filter((t) => t.kind === 'category').map((t) => t.ja)
  return [...new Set([...category, ...preferred])].slice(0, limit)
}

const keywordLimit = arg('keywords', 20)
const started = Date.now()
const keywords = crawlKeywords(keywordLimit)

console.log(`메루카리 수집 시작 — 키워드 ${keywords.length}개${hasDb() ? '' : ' (DB 없음: 저장되지 않습니다)'}`)
await ensureFxRate(true)

const matcher = new ProductMatcher(CATALOG as CatalogProduct[])
let browser: Browser | null = null
let total = 0
let failed = 0

try {
  browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--lang=ja-JP'],
  })

  for (const [i, kw] of keywords.entries()) {
    try {
      const scraped = await scrapeKeyword(browser, kw)
      const listings = scraped
        .map(toMercariListing)
        .filter((l): l is RawListing => l !== null)
      const saved = await upsertListings(enrichAll(listings, matcher))
      total += listings.length
      console.log(`  [${String(i + 1).padStart(3)}/${keywords.length}] ${kw.padEnd(16).slice(0, 16)} → ${String(listings.length).padStart(3)}건 (저장 ${saved})`)
    } catch (err) {
      failed++
      console.log(`  [!] ${kw}: ${err instanceof Error ? err.message : err}`)
    }
    if (i < keywords.length - 1) await new Promise((r) => setTimeout(r, GAP_MS))
  }
} finally {
  await browser?.close().catch(() => undefined)
  await closeSql()
}

console.log(`\n수집 완료 — ${((Date.now() - started) / 1000).toFixed(0)}초 · 매물 ${total}건 · 실패 ${failed}건`)
if (failed > keywords.length / 2) {
  console.error('절반 이상 실패했습니다. 페이지 구조가 바뀌었을 수 있습니다.')
  process.exitCode = 1
}
