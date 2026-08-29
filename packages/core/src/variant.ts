import type { CatalogProduct, VariantAttrs } from './types.js'
import { compact, normalizeText } from './text.js'
import { looksSealed } from './classify.js'

/** 색상 표기 → 표준 키 */
const COLOR_MAP: Array<[string[], string]> = [
  [['스페이스블랙', 'spaceblack'], 'space-black'],
  [['스페이스그레이', 'spacegray', 'spacegrey', '스그'], 'space-gray'],
  [['미드나이트', 'midnight'], 'midnight'],
  [['스타라이트', 'starlight'], 'starlight'],
  [['내추럴티타늄', '내츄럴티타늄', 'naturaltitanium'], 'natural-titanium'],
  [['데저트티타늄', '데저트', 'deserttitanium'], 'desert-titanium'],
  [['블랙티타늄', 'blacktitanium'], 'black-titanium'],
  [['화이트티타늄', 'whitetitanium'], 'white-titanium'],
  [['티타늄', 'titanium'], 'titanium'],
  [['팬텀블랙', 'phantomblack'], 'phantom-black'],
  [['그라파이트', 'graphite'], 'graphite'],
  [['라벤더', 'lavender'], 'lavender'],
  [['블랙', 'black', '검정', '검은', '흑'], 'black'],
  [['화이트', 'white', '흰', '백색'], 'white'],
  [['실버', 'silver', '은색'], 'silver'],
  [['골드', 'gold', '금색'], 'gold'],
  [['로즈골드', 'rosegold'], 'rose-gold'],
  [['블루', 'blue', '파랑', '파란'], 'blue'],
  [['네이비', 'navy'], 'navy'],
  [['퍼플', 'purple', '보라'], 'purple'],
  [['핑크', 'pink', '분홍'], 'pink'],
  [['그린', 'green', '초록'], 'green'],
  [['레드', 'red', '빨강'], 'red'],
  [['옐로', 'yellow', '노랑'], 'yellow'],
  [['그레이', 'gray', 'grey', '회색'], 'gray'],
  [['크림', 'cream'], 'cream'],
  [['민트', 'mint'], 'mint'],
]

export const COLOR_LABEL: Record<string, string> = {
  'space-black': '스페이스 블랙', 'space-gray': '스페이스 그레이', midnight: '미드나이트',
  starlight: '스타라이트', 'natural-titanium': '내추럴 티타늄', 'desert-titanium': '데저트 티타늄',
  'black-titanium': '블랙 티타늄', 'white-titanium': '화이트 티타늄', titanium: '티타늄',
  'phantom-black': '팬텀 블랙', graphite: '그라파이트', lavender: '라벤더',
  black: '블랙', white: '화이트', silver: '실버', gold: '골드', 'rose-gold': '로즈 골드',
  blue: '블루', navy: '네이비', purple: '퍼플', pink: '핑크', green: '그린', red: '레드',
  yellow: '옐로', gray: '그레이', cream: '크림', mint: '민트',
}

const GRADE_RE = /([sabc])급/

/** 통신사 / 자급제 */
export function extractCarrier(rawTitle: string): string | null {
  const c = compact(rawTitle)
  if (c.includes('자급제')) return 'unlocked'
  if (c.includes('skt') || c.includes('에스케이')) return 'skt'
  if (c.includes('kt') && !c.includes('skt')) return 'kt'
  if (c.includes('lgu') || c.includes('유플러스') || c.includes('lg유플')) return 'lgu'
  return null
}

/**
 * 제목에서 변형 속성을 뽑는다.
 * 저장용량은 명시적 단위(256gb/1tb)를 최우선으로 하고,
 * 없으면 해당 제품이 실제로 파는 용량 숫자만 골라 오탐을 막는다.
 */
/** 실제로 존재하는 저장용량 값 */
const KNOWN_STORAGES = [16, 32, 64, 128, 256, 512, 1024, 2048]

/**
 * "…m4256gb" 처럼 앞 숫자가 붙어버린 경우를 대비해
 * gb 앞 숫자열의 뒤에서부터 잘라 실재하는 용량을 찾는다. (4256 → 256)
 */
function resolveStorageDigits(digits: string, allowed: readonly number[]): number | undefined {
  for (let len = Math.min(4, digits.length); len >= 1; len--) {
    const n = Number(digits.slice(-len))
    if (allowed.includes(n)) return n
  }
  return undefined
}

/**
 * 제목에서 변형 속성을 뽑는다.
 * 저장용량은 (1) 단위가 붙은 표기 → (2) 해당 제품이 실제 파는 용량 숫자 순으로 찾는다.
 * 숫자 뒤에 한글 단위(만원 등)가 오면 가격으로 보고 무시한다.
 */
export function extractVariant(rawTitle: string, product?: CatalogProduct): VariantAttrs {
  const t = normalizeText(rawTitle)
  const c = compact(rawTitle)
  const attrs: VariantAttrs = {}
  const allowed = product?.storages?.length ? product.storages : KNOWN_STORAGES

  // (1) 단위 표기: 1tb / 256gb
  for (const m of t.matchAll(/(\d+)tb/g)) {
    const n = Number(m[1]!.slice(-1)) * 1024
    if (allowed.includes(n)) { attrs.storageGb = n; break }
  }
  if (attrs.storageGb === undefined) {
    for (const m of t.matchAll(/(\d+)gb/g)) {
      const n = resolveStorageDigits(m[1]!, allowed)
      if (n !== undefined) { attrs.storageGb = n; break }
    }
  }

  // (2) 단위 없는 숫자 — 그 제품이 파는 용량일 때만, 가격 표기가 아닐 때만
  if (attrs.storageGb === undefined && product?.storages?.length) {
    for (const m of t.matchAll(/(?<![0-9])(\d{2,4})(?![0-9])(?!\s*(?:만|원|천|개|대|명|인치|기가바이트))/g)) {
      const n = Number(m[1])
      if (product.storages.includes(n)) { attrs.storageGb = n; break }
    }
  }

  for (const [keys, std] of COLOR_MAP) {
    if (keys.some((k) => c.includes(k))) { attrs.color = std; break }
  }

  const g = c.match(GRADE_RE)
  if (g?.[1]) attrs.grade = g[1].toUpperCase()

  if (looksSealed(rawTitle)) attrs.sealed = true

  return attrs
}

export function buildVariantKey(attrs: VariantAttrs, product?: CatalogProduct): string | null {
  if (!product?.storages?.length) return null
  if (attrs.storageGb === undefined) return null
  return `s${attrs.storageGb}`
}

/** "s256" → "256GB", "s1024" → "1TB" */
export function formatVariantKey(key: string | null): string {
  if (!key) return '전체'
  const m = key.match(/^s(\d+)$/)
  if (!m?.[1]) return key
  const gb = Number(m[1])
  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`
}

export function formatStorage(gb: number | undefined): string | null {
  if (gb === undefined) return null
  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`
}
