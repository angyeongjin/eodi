import type { MetadataRoute } from 'next'
import { CATALOG } from '@eodi/core'
import { SEED_KEYWORDS } from '@eodi/crawler'
import { GOODS_TERMS, goodsWorks } from '@eodi/core'
import { SITE } from '@/lib/config'

export const revalidate = 86400

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url.replace(/\/$/, '')
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/cost`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/status`, lastModified: now, changeFrequency: 'daily', priority: 0.3 },
  ]

  // 표준 제품명 + 인기 검색어를 롱테일 랜딩으로 노출한다
  const terms = [
    ...CATALOG.map((p) => p.name),
    ...SEED_KEYWORDS.slice(0, 300),
  ]
  const unique = [...new Set(terms)]

  /*
    일본 굿즈 랜딩은 우리만 가진 지면이다.
    사전의 한글 표제어 하나하나가 "그 말로 일본 굿즈를 찾을 수 있는 유일한 페이지"가 된다.
    작품 × 굿즈 종류 조합까지 만들면 롱테일이 크게 늘어난다.
  */
  const goodsKo = [...new Set(GOODS_TERMS.map((t) => t.ko[0]!).filter(Boolean))]
  const ipKo = GOODS_TERMS.filter((t) => t.kind === 'ip').map((t) => t.ko[0]!)
  const formKo = GOODS_TERMS.filter((t) => t.kind === 'category').slice(0, 12).map((t) => t.ko[0]!)
  const combos = ipKo.flatMap((ip) => formKo.slice(0, 6).map((f) => `${ip} ${f}`))
  const jpTerms = [...new Set([...goodsKo, ...combos])]

  /*
    작품 지면은 검색어를 모르는 사람의 입구다.
    /s/, /jp/ 는 "그 말을 이미 아는 사람"에게 닿는 지면이라 서로 겹치지 않는다.
  */
  const works = goodsWorks().map((w) => w.ko)

  return [
    ...staticPages,
    ...works.map((w) => ({
      url: `${base}/w/${encodeURIComponent(w)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...unique.map((t) => ({
      url: `${base}/s/${encodeURIComponent(t)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    ...jpTerms.map((t) => ({
      url: `${base}/jp/${encodeURIComponent(t)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]
}
