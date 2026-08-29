/**
 * 키워드별로 모은 매물을 번갈아 담는다.
 *
 * 한 키워드가 목록을 다 먹으면 "내가 찾던 것들"이라는 말이 거짓이 된다.
 * 최근 검색어 세 개를 남겼는데 첫 번째 것만 12칸을 채우면, 그건 피드가 아니라 검색 결과다.
 */
export function interleaveByTerm<T>(
  buckets: ReadonlyArray<ReadonlyArray<T>>,
  total: number,
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set<string>()
  const picked: T[] = []
  let round = 0

  while (picked.length < total && buckets.some((b) => b.length > round)) {
    for (const bucket of buckets) {
      const item = bucket[round]
      if (item === undefined) continue
      const key = keyOf(item)
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(item)
      if (picked.length >= total) break
    }
    round++
  }

  return picked
}
