import { after } from 'next/server'
import { search, type SearchOptions } from '@eodi/crawler'
import type { SearchQuery, SearchResponse } from '@eodi/core'

/**
 * 화면·API 가 쓰는 검색 진입점.
 *
 * `@eodi/crawler` 를 직접 부르지 않고 여기를 거치는 이유는 하나다 —
 * **매물 저장·캐시 쓰기·로그를 사용자 응답 경로에서 빼기 위해서.**
 * 실측에서 응답을 만든 뒤(tookMs) 실제 HTTP 가 끝나기까지 약 2초가 더 걸렸고,
 * 그 2초는 전부 사용자와 상관없는 뒷정리였다.
 *
 * `after` 는 Next 의 표준 API 라 호스팅을 옮겨도 따라간다(ADR-0006).
 * 크롤러 쪽은 프레임워크를 모르는 채로 두고, 미룰 수단만 주입받는다 —
 * CLI·크론은 이 함수를 쓰지 않으므로 예전처럼 응답 전에 저장을 끝낸다.
 */
export function searchForRequest(
  query: SearchQuery,
  opts: Omit<SearchOptions, 'defer'> = {},
): Promise<SearchResponse> {
  return search(query, {
    ...opts,
    defer: (task) => {
      after(async () => {
        try {
          await task()
        } catch (err) {
          // 뒷정리 실패가 이미 나간 응답을 되돌릴 수는 없다. 남기고 넘어간다.
          console.warn('[search] 응답 후 작업 실패:', err instanceof Error ? err.message : err)
        }
      })
    },
  })
}
