import { tokenize } from '@eodi/core'

/**
 * 검색어 강조.
 *
 * 일본어 결과에서 "내가 친 말이 어디에 걸렸는지" 안 보이면 결과를 신뢰하기 어렵다.
 * 특히 해외 탭은 제목이 전부 일본어라 한국 사용자가 훑을 단서가 필요하다.
 */
export default function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = [...new Set(tokenize(query))].filter((t) => t.length >= 2)
  if (tokens.length === 0) return <>{text}</>

  // 긴 토큰부터 잡아야 짧은 토큰이 먼저 잘라먹지 않는다
  const pattern = tokens
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')

  let parts: string[]
  try {
    parts = text.split(new RegExp(`(${pattern})`, 'gi'))
  } catch {
    return <>{text}</>
  }

  const lower = new Set(tokens.map((t) => t.toLowerCase()))
  return (
    <>
      {parts.map((p, i) =>
        lower.has(p.toLowerCase()) ? (
          <mark
            key={i}
            style={{ background: 'var(--brand-weak)', color: 'var(--brand-text)', padding: '0 1px', borderRadius: 2 }}
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
