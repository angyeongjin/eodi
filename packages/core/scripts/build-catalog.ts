/**
 * 표준 제품 카탈로그 생성기.
 * 사람이 읽고 고치는 것은 이 파일이고, 런타임이 읽는 것은 data/catalog.json 이다.
 *
 * 매칭 규칙(match.require)은 compact(공백·기호 제거, 소문자) 제목 기준이다.
 *  - require: AND 로 묶인 그룹 배열. 각 그룹은 OR.
 *  - 한/영 혼용 표기를 전부 커버하려고 cart() 로 조합을 펼친다.
 *    예) cart(['아이폰','iphone'], ['16'], ['프로','pro'])
 *        → 아이폰16프로 / 아이폰16pro / iphone16프로 / iphone16pro
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CatalogProduct, CategoryId } from '../src/types.js'

const cart = (...parts: string[][]): string[] =>
  parts.reduce<string[]>((acc, p) => acc.flatMap((a) => p.map((x) => a + x)), [''])

const S = {
  phone: [128, 256, 512, 1024],
  phoneSmall: [64, 128, 256],
  pad: [64, 128, 256, 512, 1024, 2048],
  mac: [256, 512, 1024, 2048],
} as const

type Def = {
  slug: string
  brand: string
  name: string
  nameEn?: string
  category: CategoryId
  releasedAt?: string
  msrp?: number
  require: string[][]
  exclude?: string[]
  storages?: readonly number[]
  aliases?: string[]
}

const APPLE = '애플'
const SAMSUNG = '삼성'

/** 아이폰 계열: 이름 파트를 조합해 연속형 별칭을 만든다 */
function iphone(
  num: string,
  suffixKo: string[],
  label: string,
  msrp: number,
  releasedAt: string,
  storages: readonly number[] = S.phone,
): Def {
  const head = ['아이폰', 'iphone', 'ip']
  const require =
    suffixKo.length > 0
      ? [cart(head, [num], suffixKo)]
      : [cart(head, [num])]
  return {
    slug: `iphone-${label.toLowerCase().replace(/\s+/g, '-')}`,
    brand: APPLE,
    name: `아이폰 ${label}`,
    nameEn: `iPhone ${label}`,
    category: 'smartphone',
    releasedAt,
    msrp,
    require,
    storages,
  }
}

const iphones: Def[] = [
  iphone('11', [], '11', 990_000, '2019-09', S.phoneSmall),
  iphone('11', ['프로', 'pro'], '11 Pro', 1_390_000, '2019-09', [64, 256, 512]),
  iphone('11', ['프로맥스', 'promax', '프로max', 'pro맥스'], '11 Pro Max', 1_550_000, '2019-09', [64, 256, 512]),
  iphone('12', ['미니', 'mini'], '12 mini', 950_000, '2020-10', S.phoneSmall),
  iphone('12', [], '12', 1_090_000, '2020-10', S.phoneSmall),
  iphone('12', ['프로', 'pro'], '12 Pro', 1_350_000, '2020-10', [128, 256, 512]),
  iphone('12', ['프로맥스', 'promax', '프로max', 'pro맥스'], '12 Pro Max', 1_490_000, '2020-10', [128, 256, 512]),
  iphone('13', ['미니', 'mini'], '13 mini', 950_000, '2021-09', S.phoneSmall),
  iphone('13', [], '13', 1_090_000, '2021-09', S.phoneSmall),
  iphone('13', ['프로', 'pro'], '13 Pro', 1_350_000, '2021-09', S.phone),
  iphone('13', ['프로맥스', 'promax', '프로max', 'pro맥스'], '13 Pro Max', 1_490_000, '2021-09', S.phone),
  iphone('14', [], '14', 1_250_000, '2022-09', [128, 256, 512]),
  iphone('14', ['플러스', 'plus'], '14 Plus', 1_350_000, '2022-09', [128, 256, 512]),
  iphone('14', ['프로', 'pro'], '14 Pro', 1_550_000, '2022-09', S.phone),
  iphone('14', ['프로맥스', 'promax', '프로max', 'pro맥스'], '14 Pro Max', 1_750_000, '2022-09', S.phone),
  iphone('15', [], '15', 1_250_000, '2023-09', [128, 256, 512]),
  iphone('15', ['플러스', 'plus'], '15 Plus', 1_350_000, '2023-09', [128, 256, 512]),
  iphone('15', ['프로', 'pro'], '15 Pro', 1_550_000, '2023-09', S.phone),
  iphone('15', ['프로맥스', 'promax', '프로max', 'pro맥스'], '15 Pro Max', 1_900_000, '2023-09', [256, 512, 1024]),
  iphone('16', ['e'], '16e', 990_000, '2025-02', [128, 256, 512]),
  iphone('16', [], '16', 1_250_000, '2024-09', [128, 256, 512]),
  iphone('16', ['플러스', 'plus'], '16 Plus', 1_350_000, '2024-09', [128, 256, 512]),
  iphone('16', ['프로', 'pro'], '16 Pro', 1_550_000, '2024-09', S.phone),
  iphone('16', ['프로맥스', 'promax', '프로max', 'pro맥스'], '16 Pro Max', 1_900_000, '2024-09', [256, 512, 1024]),
  iphone('17', [], '17', 1_290_000, '2025-09', [256, 512]),
  iphone('17', ['에어', 'air'], '17 Air', 1_590_000, '2025-09', [256, 512, 1024]),
  iphone('17', ['프로', 'pro'], '17 Pro', 1_790_000, '2025-09', [256, 512, 1024]),
  iphone('17', ['프로맥스', 'promax', '프로max', 'pro맥스'], '17 Pro Max', 1_990_000, '2025-09', [256, 512, 1024, 2048]),
  {
    slug: 'iphone-se-2',
    brand: APPLE, name: '아이폰 SE 2세대', nameEn: 'iPhone SE (2nd gen)',
    category: 'smartphone', releasedAt: '2020-04', msrp: 550_000,
    require: [cart(['아이폰', 'iphone'], ['se'], ['2', '2세대', 'se2'])],
    storages: [64, 128, 256],
  },
  {
    slug: 'iphone-se-3',
    brand: APPLE, name: '아이폰 SE 3세대', nameEn: 'iPhone SE (3rd gen)',
    category: 'smartphone', releasedAt: '2022-03', msrp: 590_000,
    require: [cart(['아이폰', 'iphone'], ['se'], ['3', '3세대'])],
    storages: [64, 128, 256],
  },
]

/** 갤럭시 S 계열 */
function galaxyS(num: string, suffix: string[], label: string, msrp: number, releasedAt: string, storages: readonly number[]): Def {
  const head = ['갤럭시s', 'galaxys', '겔럭시s', 'gs']
  return {
    slug: `galaxy-s${label.toLowerCase().replace(/\s+/g, '-')}`,
    brand: SAMSUNG,
    name: `갤럭시 S${label}`,
    nameEn: `Galaxy S${label}`,
    category: 'smartphone',
    releasedAt, msrp,
    require: suffix.length ? [cart(head, [num], suffix)] : [cart(head, [num])],
    storages,
  }
}

const galaxies: Def[] = [
  galaxyS('21', [], '21', 999_900, '2021-01', [128, 256]),
  galaxyS('21', ['플러스', 'plus', '+'], '21 Plus', 1_199_000, '2021-01', [128, 256]),
  galaxyS('21', ['울트라', 'ultra'], '21 Ultra', 1_452_000, '2021-01', [128, 256, 512]),
  galaxyS('22', [], '22', 999_900, '2022-02', [128, 256]),
  galaxyS('22', ['플러스', 'plus', '+'], '22 Plus', 1_199_000, '2022-02', [128, 256]),
  galaxyS('22', ['울트라', 'ultra'], '22 Ultra', 1_452_000, '2022-02', [128, 256, 512, 1024]),
  galaxyS('23', [], '23', 1_155_000, '2023-02', [128, 256]),
  galaxyS('23', ['플러스', 'plus', '+'], '23 Plus', 1_353_000, '2023-02', [256, 512]),
  galaxyS('23', ['울트라', 'ultra'], '23 Ultra', 1_599_400, '2023-02', [256, 512, 1024]),
  galaxyS('23', ['fe'], '23 FE', 848_000, '2023-10', [128, 256]),
  galaxyS('24', [], '24', 1_155_000, '2024-01', [256, 512]),
  galaxyS('24', ['플러스', 'plus', '+'], '24 Plus', 1_353_000, '2024-01', [256, 512]),
  galaxyS('24', ['울트라', 'ultra'], '24 Ultra', 1_698_400, '2024-01', [256, 512, 1024]),
  galaxyS('24', ['fe'], '24 FE', 949_300, '2024-10', [128, 256]),
  galaxyS('25', [], '25', 1_155_000, '2025-02', [256, 512]),
  galaxyS('25', ['플러스', 'plus', '+'], '25 Plus', 1_353_000, '2025-02', [256, 512]),
  galaxyS('25', ['울트라', 'ultra'], '25 Ultra', 1_698_400, '2025-02', [256, 512, 1024]),
  galaxyS('25', ['엣지', 'edge'], '25 Edge', 1_499_000, '2025-05', [256, 512]),
]

function foldable(kind: 'flip' | 'fold', num: string, msrp: number, releasedAt: string, storages: readonly number[]): Def {
  const head = kind === 'flip'
    ? ['갤럭시z플립', 'galaxyzflip', 'z플립', 'zflip', '제트플립', '갤럭시플립']
    : ['갤럭시z폴드', 'galaxyzfold', 'z폴드', 'zfold', '제트폴드', '갤럭시폴드']
  const label = kind === 'flip' ? `Z 플립 ${num}` : `Z 폴드 ${num}`
  return {
    slug: `galaxy-z-${kind}-${num}`,
    brand: SAMSUNG,
    name: `갤럭시 ${label}`,
    nameEn: `Galaxy Z ${kind === 'flip' ? 'Flip' : 'Fold'} ${num}`,
    category: 'smartphone',
    releasedAt, msrp,
    require: [cart(head, [num])],
    storages,
  }
}

const foldables: Def[] = [
  foldable('flip', '3', 1_254_000, '2021-08', [128, 256]),
  foldable('flip', '4', 1_353_000, '2022-08', [256, 512]),
  foldable('flip', '5', 1_399_200, '2023-08', [256, 512]),
  foldable('flip', '6', 1_485_000, '2024-07', [256, 512]),
  foldable('flip', '7', 1_485_000, '2025-07', [256, 512]),
  foldable('fold', '3', 1_998_700, '2021-08', [256, 512]),
  foldable('fold', '4', 1_998_700, '2022-08', [256, 512, 1024]),
  foldable('fold', '5', 2_098_700, '2023-08', [256, 512, 1024]),
  foldable('fold', '6', 2_228_700, '2024-07', [256, 512, 1024]),
  foldable('fold', '7', 2_388_000, '2025-07', [256, 512, 1024]),
]

const tablets: Def[] = [
  {
    slug: 'ipad-pro-11-m4', brand: APPLE, name: '아이패드 프로 11 (M4)', nameEn: 'iPad Pro 11 M4',
    category: 'tablet', releasedAt: '2024-05', msrp: 1_499_000,
    require: [cart(['아이패드', 'ipad'], ['프로', 'pro']), ['11'], ['m4']], storages: S.pad,
  },
  {
    slug: 'ipad-pro-13-m4', brand: APPLE, name: '아이패드 프로 13 (M4)', nameEn: 'iPad Pro 13 M4',
    category: 'tablet', releasedAt: '2024-05', msrp: 1_999_000,
    require: [cart(['아이패드', 'ipad'], ['프로', 'pro']), ['13'], ['m4']], storages: S.pad,
  },
  {
    slug: 'ipad-pro-11-m2', brand: APPLE, name: '아이패드 프로 11 (M2)', nameEn: 'iPad Pro 11 M2',
    category: 'tablet', releasedAt: '2022-10', msrp: 1_249_000,
    require: [cart(['아이패드', 'ipad'], ['프로', 'pro']), ['11'], ['m2']], storages: S.pad,
  },
  {
    slug: 'ipad-air-11-m2', brand: APPLE, name: '아이패드 에어 11 (M2)', nameEn: 'iPad Air 11 M2',
    category: 'tablet', releasedAt: '2024-05', msrp: 899_000,
    require: [cart(['아이패드', 'ipad'], ['에어', 'air']), ['11'], ['m2']], storages: [128, 256, 512, 1024],
  },
  {
    slug: 'ipad-air-5', brand: APPLE, name: '아이패드 에어 5세대', nameEn: 'iPad Air 5',
    category: 'tablet', releasedAt: '2022-03', msrp: 929_000,
    require: [cart(['아이패드', 'ipad'], ['에어', 'air'], ['5', '5세대', 'm1'])], storages: [64, 256],
  },
  {
    slug: 'ipad-10', brand: APPLE, name: '아이패드 10세대', nameEn: 'iPad 10th gen',
    category: 'tablet', releasedAt: '2022-10', msrp: 679_000,
    require: [cart(['아이패드', 'ipad'], ['10세대', '10th'])], storages: [64, 256],
  },
  {
    slug: 'ipad-mini-6', brand: APPLE, name: '아이패드 미니 6세대', nameEn: 'iPad mini 6',
    category: 'tablet', releasedAt: '2021-09', msrp: 649_000,
    require: [cart(['아이패드', 'ipad'], ['미니', 'mini'], ['6', '6세대'])], storages: [64, 256],
  },
  {
    slug: 'ipad-mini-7', brand: APPLE, name: '아이패드 미니 7세대', nameEn: 'iPad mini 7',
    category: 'tablet', releasedAt: '2024-10', msrp: 749_000,
    require: [cart(['아이패드', 'ipad'], ['미니', 'mini'], ['7', '7세대'])], storages: [128, 256, 512],
  },
  {
    slug: 'galaxy-tab-s9', brand: SAMSUNG, name: '갤럭시 탭 S9', nameEn: 'Galaxy Tab S9',
    category: 'tablet', releasedAt: '2023-08', msrp: 1_199_000,
    require: [cart(['갤럭시탭', 'galaxytab', '갤탭'], ['s9'])], exclude: ['s9plus', 's9플러스', 's9울트라', 's9ultra', 's9fe'],
    storages: [128, 256, 512],
  },
  {
    slug: 'galaxy-tab-s9-ultra', brand: SAMSUNG, name: '갤럭시 탭 S9 울트라', nameEn: 'Galaxy Tab S9 Ultra',
    category: 'tablet', releasedAt: '2023-08', msrp: 1_699_000,
    require: [cart(['갤럭시탭', 'galaxytab', '갤탭'], ['s9'], ['울트라', 'ultra'])], storages: [256, 512, 1024],
  },
  {
    slug: 'galaxy-tab-s10-plus', brand: SAMSUNG, name: '갤럭시 탭 S10+', nameEn: 'Galaxy Tab S10 Plus',
    category: 'tablet', releasedAt: '2024-10', msrp: 1_399_000,
    require: [cart(['갤럭시탭', 'galaxytab', '갤탭'], ['s10'], ['플러스', 'plus', '+'])], storages: [256, 512],
  },
]

const laptops: Def[] = [
  {
    slug: 'macbook-air-m1-13', brand: APPLE, name: '맥북 에어 M1 13"', nameEn: 'MacBook Air M1 13',
    category: 'laptop', releasedAt: '2020-11', msrp: 1_290_000,
    require: [cart(['맥북', 'macbook'], ['에어', 'air']), ['m1']], storages: [256, 512, 1024],
  },
  {
    slug: 'macbook-air-m2-13', brand: APPLE, name: '맥북 에어 M2 13"', nameEn: 'MacBook Air M2 13',
    category: 'laptop', releasedAt: '2022-07', msrp: 1_690_000,
    require: [cart(['맥북', 'macbook'], ['에어', 'air']), ['m2']], exclude: ['15인치', '15in', 'm215'],
    storages: S.mac,
  },
  {
    slug: 'macbook-air-m3-13', brand: APPLE, name: '맥북 에어 M3 13"', nameEn: 'MacBook Air M3 13',
    category: 'laptop', releasedAt: '2024-03', msrp: 1_690_000,
    require: [cart(['맥북', 'macbook'], ['에어', 'air']), ['m3'], ['13']], storages: S.mac,
  },
  {
    slug: 'macbook-air-m3-15', brand: APPLE, name: '맥북 에어 M3 15"', nameEn: 'MacBook Air M3 15',
    category: 'laptop', releasedAt: '2024-03', msrp: 1_990_000,
    require: [cart(['맥북', 'macbook'], ['에어', 'air']), ['m3'], ['15']], storages: S.mac,
  },
  {
    slug: 'macbook-air-m4-13', brand: APPLE, name: '맥북 에어 M4 13"', nameEn: 'MacBook Air M4 13',
    category: 'laptop', releasedAt: '2025-03', msrp: 1_590_000,
    require: [cart(['맥북', 'macbook'], ['에어', 'air']), ['m4'], ['13']], storages: S.mac,
  },
  {
    slug: 'macbook-pro-14-m3', brand: APPLE, name: '맥북 프로 14" M3', nameEn: 'MacBook Pro 14 M3',
    category: 'laptop', releasedAt: '2023-11', msrp: 2_390_000,
    require: [cart(['맥북', 'macbook'], ['프로', 'pro']), ['14'], ['m3']], storages: [512, 1024, 2048],
  },
  {
    slug: 'macbook-pro-14-m4', brand: APPLE, name: '맥북 프로 14" M4', nameEn: 'MacBook Pro 14 M4',
    category: 'laptop', releasedAt: '2024-11', msrp: 2_390_000,
    require: [cart(['맥북', 'macbook'], ['프로', 'pro']), ['14'], ['m4']], storages: [512, 1024, 2048],
  },
  {
    slug: 'macbook-pro-16-m3', brand: APPLE, name: '맥북 프로 16" M3', nameEn: 'MacBook Pro 16 M3',
    category: 'laptop', releasedAt: '2023-11', msrp: 3_690_000,
    require: [cart(['맥북', 'macbook'], ['프로', 'pro']), ['16'], ['m3']], storages: [512, 1024, 2048],
  },
  {
    slug: 'lg-gram-16', brand: 'LG', name: 'LG 그램 16', nameEn: 'LG gram 16',
    category: 'laptop', msrp: 1_890_000,
    require: [cart(['lg', ''], ['그램', 'gram']), ['16']], storages: [256, 512, 1024],
  },
  {
    slug: 'galaxy-book4-pro', brand: SAMSUNG, name: '갤럭시 북4 프로', nameEn: 'Galaxy Book4 Pro',
    category: 'laptop', releasedAt: '2024-02', msrp: 2_299_000,
    require: [cart(['갤럭시북', 'galaxybook', '갤북'], ['4']), ['프로', 'pro']], storages: [512, 1024],
  },
]

const earbuds: Def[] = [
  {
    slug: 'airpods-2', brand: APPLE, name: '에어팟 2세대', nameEn: 'AirPods 2',
    category: 'earbuds', releasedAt: '2019-03', msrp: 219_000,
    require: [cart(['에어팟', 'airpods', '에어팟'], ['2', '2세대'])],
    exclude: ['프로', 'pro', '맥스', 'max'],
  },
  {
    slug: 'airpods-3', brand: APPLE, name: '에어팟 3세대', nameEn: 'AirPods 3',
    category: 'earbuds', releasedAt: '2021-10', msrp: 249_000,
    require: [cart(['에어팟', 'airpods'], ['3', '3세대'])],
    exclude: ['프로', 'pro', '맥스', 'max'],
  },
  {
    slug: 'airpods-4', brand: APPLE, name: '에어팟 4세대', nameEn: 'AirPods 4',
    category: 'earbuds', releasedAt: '2024-09', msrp: 199_000,
    require: [cart(['에어팟', 'airpods'], ['4', '4세대'])],
    exclude: ['프로', 'pro', '맥스', 'max'],
  },
  {
    slug: 'airpods-pro-1', brand: APPLE, name: '에어팟 프로 1세대', nameEn: 'AirPods Pro',
    category: 'earbuds', releasedAt: '2019-10', msrp: 329_000,
    require: [cart(['에어팟', 'airpods'], ['프로', 'pro'], ['1', '1세대'])],
  },
  {
    slug: 'airpods-pro-2', brand: APPLE, name: '에어팟 프로 2세대', nameEn: 'AirPods Pro 2',
    category: 'earbuds', releasedAt: '2022-09', msrp: 359_000,
    require: [cart(['에어팟', 'airpods'], ['프로', 'pro'], ['2', '2세대'])],
  },
  {
    slug: 'airpods-pro-3', brand: APPLE, name: '에어팟 프로 3세대', nameEn: 'AirPods Pro 3',
    category: 'earbuds', releasedAt: '2025-09', msrp: 359_000,
    require: [cart(['에어팟', 'airpods'], ['프로', 'pro'], ['3', '3세대'])],
  },
  {
    slug: 'airpods-max', brand: APPLE, name: '에어팟 맥스', nameEn: 'AirPods Max',
    category: 'earbuds', releasedAt: '2020-12', msrp: 769_000,
    require: [cart(['에어팟', 'airpods'], ['맥스', 'max'])],
  },
  {
    slug: 'galaxy-buds2-pro', brand: SAMSUNG, name: '갤럭시 버즈2 프로', nameEn: 'Galaxy Buds2 Pro',
    category: 'earbuds', releasedAt: '2022-08', msrp: 259_000,
    require: [cart(['갤럭시버즈', 'galaxybuds', '버즈'], ['2'], ['프로', 'pro'])],
  },
  {
    slug: 'galaxy-buds3-pro', brand: SAMSUNG, name: '갤럭시 버즈3 프로', nameEn: 'Galaxy Buds3 Pro',
    category: 'earbuds', releasedAt: '2024-07', msrp: 309_000,
    require: [cart(['갤럭시버즈', 'galaxybuds', '버즈'], ['3'], ['프로', 'pro'])],
  },
  {
    slug: 'sony-wh-1000xm4', brand: '소니', name: '소니 WH-1000XM4', nameEn: 'Sony WH-1000XM4',
    category: 'earbuds', releasedAt: '2020-08', msrp: 449_000,
    require: [['1000xm4', 'wh1000xm4', 'xm4']],
  },
  {
    slug: 'sony-wh-1000xm5', brand: '소니', name: '소니 WH-1000XM5', nameEn: 'Sony WH-1000XM5',
    category: 'earbuds', releasedAt: '2022-05', msrp: 499_000,
    require: [['1000xm5', 'wh1000xm5', 'xm5']],
  },
  {
    slug: 'bose-qc-ultra', brand: '보스', name: '보스 QC 울트라 헤드폰', nameEn: 'Bose QuietComfort Ultra',
    category: 'earbuds', releasedAt: '2023-10', msrp: 499_000,
    require: [cart(['qc', '큐씨'], ['울트라', 'ultra'])],
  },
]

const watches: Def[] = [
  {
    slug: 'apple-watch-se-2', brand: APPLE, name: '애플워치 SE 2세대', nameEn: 'Apple Watch SE 2',
    category: 'watch', releasedAt: '2022-09', msrp: 359_000,
    require: [cart(['애플워치', 'applewatch', '애플와치'], ['se']), ['2', '2세대']],
  },
  {
    slug: 'apple-watch-s9', brand: APPLE, name: '애플워치 시리즈 9', nameEn: 'Apple Watch Series 9',
    category: 'watch', releasedAt: '2023-09', msrp: 599_000,
    require: [cart(['애플워치', 'applewatch'], ['시리즈', 'series', 's', ''], ['9'])],
  },
  {
    slug: 'apple-watch-s10', brand: APPLE, name: '애플워치 시리즈 10', nameEn: 'Apple Watch Series 10',
    category: 'watch', releasedAt: '2024-09', msrp: 599_000,
    require: [cart(['애플워치', 'applewatch'], ['시리즈', 'series', 's', ''], ['10'])],
  },
  {
    slug: 'apple-watch-ultra-2', brand: APPLE, name: '애플워치 울트라 2', nameEn: 'Apple Watch Ultra 2',
    category: 'watch', releasedAt: '2023-09', msrp: 1_149_000,
    require: [cart(['애플워치', 'applewatch'], ['울트라', 'ultra']), ['2']],
  },
  {
    slug: 'galaxy-watch-6', brand: SAMSUNG, name: '갤럭시 워치6', nameEn: 'Galaxy Watch6',
    category: 'watch', releasedAt: '2023-08', msrp: 359_000,
    require: [cart(['갤럭시워치', 'galaxywatch', '갤워치'], ['6'])],
  },
  {
    slug: 'galaxy-watch-7', brand: SAMSUNG, name: '갤럭시 워치7', nameEn: 'Galaxy Watch7',
    category: 'watch', releasedAt: '2024-07', msrp: 359_000,
    require: [cart(['갤럭시워치', 'galaxywatch', '갤워치'], ['7'])],
  },
]

const consoles: Def[] = [
  {
    slug: 'nintendo-switch-oled', brand: '닌텐도', name: '닌텐도 스위치 OLED', nameEn: 'Nintendo Switch OLED',
    category: 'console', releasedAt: '2021-10', msrp: 415_000,
    require: [cart(['닌텐도', 'nintendo', '닌텐', ''], ['스위치', 'switch']), ['oled', '올레드']],
  },
  {
    slug: 'nintendo-switch-lite', brand: '닌텐도', name: '닌텐도 스위치 라이트', nameEn: 'Nintendo Switch Lite',
    category: 'console', releasedAt: '2019-09', msrp: 259_000,
    require: [cart(['닌텐도', 'nintendo', '닌텐', ''], ['스위치', 'switch']), ['라이트', 'lite']],
  },
  {
    slug: 'nintendo-switch-2', brand: '닌텐도', name: '닌텐도 스위치 2', nameEn: 'Nintendo Switch 2',
    category: 'console', releasedAt: '2025-06', msrp: 640_000,
    require: [cart(['닌텐도', 'nintendo', '닌텐', ''], ['스위치', 'switch'], ['2'])],
  },
  {
    slug: 'nintendo-switch', brand: '닌텐도', name: '닌텐도 스위치', nameEn: 'Nintendo Switch',
    category: 'console', releasedAt: '2017-03', msrp: 360_000,
    require: [cart(['닌텐도', 'nintendo', '닌텐'], ['스위치', 'switch'])],
    exclude: ['oled', '올레드', '라이트', 'lite', '스위치2', 'switch2'],
  },
  {
    slug: 'ps5-slim', brand: '소니', name: '플레이스테이션 5 슬림', nameEn: 'PlayStation 5 Slim',
    category: 'console', releasedAt: '2023-11', msrp: 688_000,
    require: [['ps5', '플스5', '플레이스테이션5', 'playstation5'], ['슬림', 'slim']],
  },
  {
    slug: 'ps5-digital', brand: '소니', name: '플레이스테이션 5 디지털 에디션', nameEn: 'PS5 Digital Edition',
    category: 'console', releasedAt: '2020-11', msrp: 498_000,
    require: [['ps5', '플스5', '플레이스테이션5', 'playstation5'], ['디지털', 'digital']],
  },
  {
    slug: 'ps5', brand: '소니', name: '플레이스테이션 5', nameEn: 'PlayStation 5',
    category: 'console', releasedAt: '2020-11', msrp: 628_000,
    require: [['ps5', '플스5', '플레이스테이션5', 'playstation5']],
    exclude: ['슬림', 'slim', '디지털', 'digital', 'pro'],
  },
  {
    slug: 'ps5-pro', brand: '소니', name: '플레이스테이션 5 프로', nameEn: 'PlayStation 5 Pro',
    category: 'console', releasedAt: '2024-11', msrp: 1_118_000,
    require: [['ps5', '플스5', '플레이스테이션5', 'playstation5'], ['프로', 'pro']],
  },
  {
    slug: 'xbox-series-x', brand: 'MS', name: '엑스박스 시리즈 X', nameEn: 'Xbox Series X',
    category: 'console', releasedAt: '2020-11', msrp: 598_000,
    require: [['xbox', '엑스박스', '엑박'], ['시리즈x', 'seriesx']],
  },
  {
    slug: 'steam-deck-oled', brand: '밸브', name: '스팀덱 OLED', nameEn: 'Steam Deck OLED',
    category: 'console', releasedAt: '2023-11', msrp: 630_000,
    require: [['스팀덱', 'steamdeck'], ['oled', '올레드']],
  },
]

const cameras: Def[] = [
  {
    slug: 'sony-a7m4', brand: '소니', name: '소니 A7 IV (A7M4)', nameEn: 'Sony A7 IV',
    category: 'camera', releasedAt: '2021-12', msrp: 3_190_000,
    require: [['a7m4', 'a74', 'a7iv', '알파7m4', 'ilce7m4']],
  },
  {
    slug: 'sony-a7m3', brand: '소니', name: '소니 A7 III (A7M3)', nameEn: 'Sony A7 III',
    category: 'camera', releasedAt: '2018-04', msrp: 2_290_000,
    require: [['a7m3', 'a73', 'a7iii', '알파7m3', 'ilce7m3']],
  },
  {
    slug: 'sony-a6400', brand: '소니', name: '소니 A6400', nameEn: 'Sony A6400',
    category: 'camera', releasedAt: '2019-02', msrp: 1_150_000,
    require: [['a6400', 'ilce6400', '알파6400']],
  },
  {
    slug: 'canon-r6-mark2', brand: '캐논', name: '캐논 EOS R6 Mark II', nameEn: 'Canon EOS R6 Mark II',
    category: 'camera', releasedAt: '2022-11', msrp: 3_290_000,
    require: [['r6'], ['mark2', 'markii', 'm2', '2형', 'mk2']],
  },
  {
    slug: 'fujifilm-xt5', brand: '후지필름', name: '후지필름 X-T5', nameEn: 'Fujifilm X-T5',
    category: 'camera', releasedAt: '2022-11', msrp: 2_490_000,
    require: [['xt5']],
  },
]

const monitors: Def[] = [
  {
    slug: 'apple-studio-display', brand: APPLE, name: '애플 스튜디오 디스플레이', nameEn: 'Apple Studio Display',
    category: 'monitor', releasedAt: '2022-03', msrp: 1_990_000,
    require: [cart(['스튜디오', 'studio'], ['디스플레이', 'display'])],
  },
  {
    slug: 'dell-u2723qe', brand: '델', name: '델 U2723QE', nameEn: 'Dell U2723QE',
    category: 'monitor', msrp: 890_000,
    require: [['u2723qe']],
  },
]

const all: Def[] = [
  ...iphones, ...galaxies, ...foldables, ...tablets, ...laptops,
  ...earbuds, ...watches, ...consoles, ...cameras, ...monitors,
]

// ---- 검증 ----
const seen = new Set<string>()
for (const d of all) {
  if (seen.has(d.slug)) throw new Error(`중복 slug: ${d.slug}`)
  seen.add(d.slug)
  if (!d.require.length || d.require.some((g) => g.length === 0)) {
    throw new Error(`빈 require 그룹: ${d.slug}`)
  }
  for (const g of d.require) {
    for (const term of g) {
      if (term !== '' && term !== term.toLowerCase()) throw new Error(`대문자 매칭어: ${d.slug} / ${term}`)
      if (/\s/.test(term)) throw new Error(`매칭어에 공백 포함(compact 기준 위반): ${d.slug} / "${term}"`)
    }
  }
}

const products: CatalogProduct[] = all.map((d) => ({
  id: d.slug,
  slug: d.slug,
  brand: d.brand,
  name: d.name,
  ...(d.nameEn ? { nameEn: d.nameEn } : {}),
  category: d.category,
  ...(d.releasedAt ? { releasedAt: d.releasedAt } : {}),
  ...(d.msrp ? { msrp: d.msrp } : {}),
  match: { require: d.require, ...(d.exclude ? { exclude: d.exclude } : {}) },
  aliases: d.aliases ?? Array.from(new Set(d.require[0] ?? [])).slice(0, 8),
  ...(d.storages ? { storages: [...d.storages] } : {}),
}))

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '../data/catalog.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(products, null, 2) + '\n', 'utf-8')

// 런타임은 JSON 대신 이 TS 모듈을 읽는다 (import attributes·파일 복사 이슈 회피)
const tsOut = resolve(here, '../src/catalog.data.ts')
writeFileSync(
  tsOut,
  `// 이 파일은 scripts/build-catalog.ts 가 생성합니다. 직접 수정하지 마세요.\n` +
    `import type { CatalogProduct } from './types.js'\n\n` +
    `export const CATALOG: CatalogProduct[] = ${JSON.stringify(products, null, 2)}\n`,
  'utf-8',
)
console.log(`카탈로그 ${products.length}개 제품 생성 → ${outPath}, ${tsOut}`)
const byCat = products.reduce<Record<string, number>>((a, p) => ({ ...a, [p.category]: (a[p.category] ?? 0) + 1 }), {})
console.log(byCat)
