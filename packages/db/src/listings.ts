import type { EnrichedListing, ListingKind, MarketScope, RawListing, SourceId } from '@eodi/core'
import { SOURCE_SCOPE } from '@eodi/core'
import { tryDb } from './client.js'

/**
 * 수집한 매물을 영속화한다.
 * 실패해도 검색 자체는 이미 응답된 뒤이므로 조용히 넘어간다.
 */
export async function upsertListings(listings: readonly EnrichedListing[]): Promise<number> {
  if (listings.length === 0) return 0

  return tryDb(async (sql) => {
    const rows = listings.map((l) => ({
      source: l.source,
      source_item_id: l.sourceItemId,
      title: l.title,
      norm_title: l.normTitle,
      price: l.price,
      url: l.url,
      region: l.region ?? null,
      posted_at: l.postedAt ?? null,
      sold: Boolean(l.sold),
      pro_seller: Boolean(l.proSeller),
      thumbnail_url: l.thumbnailUrl ?? null,
      product_id: l.productId,
      kind: l.kind,
      storage_gb: l.variant.storageGb ?? null,
      color: l.variant.color ?? null,
      currency: l.currency ?? 'KRW',
      price_krw: l.priceKrw,
      listing_type: l.listingType ?? null,
      ends_at: l.endsAt ?? null,
      bid_count: l.bidCount ?? null,
      shipping_fee: l.shippingFee ?? null,
      seller_id: l.sellerId ?? null,
    }))

    // 배치로 나눠 넣는다. 한 번에 너무 많으면 파라미터 한도에 걸린다.
    const CHUNK = 200
    let n = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      await sql`
        INSERT INTO listings ${sql(
          chunk,
          'source', 'source_item_id', 'title', 'norm_title', 'price', 'url', 'region',
          'posted_at', 'sold', 'pro_seller', 'thumbnail_url', 'product_id', 'kind',
          'storage_gb', 'color', 'currency', 'price_krw', 'listing_type', 'ends_at',
          'bid_count', 'shipping_fee', 'seller_id',
        )}
        ON CONFLICT (source, source_item_id) DO UPDATE SET
          title         = EXCLUDED.title,
          norm_title    = EXCLUDED.norm_title,
          price         = EXCLUDED.price,
          url           = EXCLUDED.url,
          region        = COALESCE(EXCLUDED.region, listings.region),
          posted_at     = COALESCE(EXCLUDED.posted_at, listings.posted_at),
          sold          = EXCLUDED.sold,
          pro_seller    = EXCLUDED.pro_seller,
          thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, listings.thumbnail_url),
          product_id    = EXCLUDED.product_id,
          kind          = EXCLUDED.kind,
          storage_gb    = EXCLUDED.storage_gb,
          color         = EXCLUDED.color,
          currency      = EXCLUDED.currency,
          price_krw     = EXCLUDED.price_krw,
          listing_type  = EXCLUDED.listing_type,
          ends_at       = EXCLUDED.ends_at,
          bid_count     = EXCLUDED.bid_count,
          shipping_fee  = EXCLUDED.shipping_fee,
          seller_id     = COALESCE(EXCLUDED.seller_id, listings.seller_id),
          last_seen_at  = NOW()
      `
      n += chunk.length
    }
    return n
  }, 0)
}

interface ListingRow {
  source: string
  source_item_id: string
  title: string
  price: number
  url: string
  region: string | null
  posted_at: Date | null
  sold: boolean
  pro_seller: boolean
  thumbnail_url: string | null
  currency: string | null
  listing_type: string | null
  ends_at: Date | null
  bid_count: number | null
  shipping_fee: number | null
  seller_id: string | null
}

function toRaw(r: ListingRow): RawListing {
  const out: RawListing = {
    source: r.source as SourceId,
    sourceItemId: r.source_item_id,
    title: r.title,
    price: r.price,
    url: r.url,
    sold: r.sold,
  }
  if (r.region) out.region = r.region
  if (r.posted_at) out.postedAt = r.posted_at
  if (r.pro_seller) out.proSeller = true
  if (r.thumbnail_url) out.thumbnailUrl = r.thumbnail_url
  if (r.currency === 'JPY') out.currency = 'JPY'
  if (r.listing_type === 'auction' || r.listing_type === 'fixed') out.listingType = r.listing_type
  if (r.ends_at) out.endsAt = r.ends_at
  if (r.bid_count !== null) out.bidCount = r.bid_count
  if (r.shipping_fee !== null) out.shippingFee = r.shipping_fee
  if (r.seller_id) out.sellerId = r.seller_id
  return out
}

const LISTING_COLUMNS =
  'source, source_item_id, title, price, url, region, posted_at, sold, pro_seller, ' +
  'thumbnail_url, currency, listing_type, ends_at, bid_count, shipping_fee, seller_id'

/**
 * 우리 인덱스만으로 하는 폴백 검색.
 * 모든 소스가 죽었을 때 "결과 없음" 대신 최근에 본 매물이라도 보여준다.
 */
export interface StoredSearchOptions {
  limit?: number
  /** 이 일수 안에 마지막으로 확인된 매물만 */
  freshDays?: number
  includeSold?: boolean
  /** 국내/해외. 지정하면 그 시장의 소스만 본다 */
  scope?: MarketScope
}

function sourcesForScope(scope: MarketScope | undefined): SourceId[] | null {
  if (!scope) return null
  return (Object.keys(SOURCE_SCOPE) as SourceId[]).filter((s) => SOURCE_SCOPE[s] === scope)
}

export async function searchStoredListings(
  normalizedTerm: string,
  opts: StoredSearchOptions = {},
): Promise<RawListing[]> {
  const term = normalizedTerm.trim()
  if (!term) return []
  const limit = opts.limit ?? 120
  const freshDays = opts.freshDays ?? 14
  const scopeSources = sourcesForScope(opts.scope)

  return tryDb(async (sql) => {
    const rows = await sql<ListingRow[]>`
      SELECT ${sql.unsafe(LISTING_COLUMNS)}
      FROM listings
      WHERE (norm_title % ${term} OR norm_title ILIKE ${'%' + term + '%'})
        AND last_seen_at > NOW() - ${`${freshDays} days`}::interval
        ${opts.includeSold ? sql`` : sql`AND sold = FALSE`}
        ${scopeSources ? sql`AND source = ANY(${scopeSources})` : sql``}
      ORDER BY similarity(norm_title, ${term}) DESC, last_seen_at DESC
      LIMIT ${limit}
    `
    return rows.map(toRaw)
  }, [])
}

/** 특정 표준 제품의 최근 매물 (SEO 랜딩·카테고리 페이지용) */
export async function listingsByProduct(productId: string, limit = 60): Promise<RawListing[]> {
  return tryDb(async (sql) => {
    const rows = await sql<ListingRow[]>`
      SELECT ${sql.unsafe(LISTING_COLUMNS)}
      FROM listings
      WHERE product_id = ${productId} AND sold = FALSE
      ORDER BY COALESCE(posted_at, last_seen_at) DESC
      LIMIT ${limit}
    `
    return rows.map(toRaw)
  }, [])
}

export interface IndexStats {
  total: number
  bySource: Array<{ source: SourceId; count: number }>
  byKind: Array<{ kind: ListingKind; count: number }>
  newestAt: Date | null
}

/** 운영 상태 페이지용 지표 */
export async function indexStats(): Promise<IndexStats> {
  return tryDb(
    async (sql) => {
      const [totalRow] = await sql<Array<{ count: string; newest: Date | null }>>`
        SELECT COUNT(*)::text AS count, MAX(last_seen_at) AS newest FROM listings
      `
      const bySource = await sql<Array<{ source: string; count: string }>>`
        SELECT source, COUNT(*)::text AS count FROM listings GROUP BY source ORDER BY 2 DESC
      `
      const byKind = await sql<Array<{ kind: string; count: string }>>`
        SELECT kind, COUNT(*)::text AS count FROM listings GROUP BY kind ORDER BY 2 DESC
      `
      return {
        total: Number(totalRow?.count ?? 0),
        newestAt: totalRow?.newest ?? null,
        bySource: bySource.map((r) => ({ source: r.source as SourceId, count: Number(r.count) })),
        byKind: byKind.map((r) => ({ kind: r.kind as ListingKind, count: Number(r.count) })),
      }
    },
    { total: 0, bySource: [], byKind: [], newestAt: null },
  )
}

/** 오래된 매물 정리 — 무료 티어 용량을 지키기 위한 회전 보관 */
export async function pruneOldListings(days = 90): Promise<number> {
  return tryDb(async (sql) => {
    const rows = await sql<Array<{ count: string }>>`
      WITH deleted AS (
        DELETE FROM listings WHERE last_seen_at < NOW() - ${`${days} days`}::interval RETURNING 1
      )
      SELECT COUNT(*)::text AS count FROM deleted
    `
    return Number(rows[0]?.count ?? 0)
  }, 0)
}
