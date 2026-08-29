import { SITE } from '@/lib/config'

/**
 * 워드마크.
 *
 * 돋보기는 장식이 아니라 이름의 시각적 반복이다 — "어디있지"는 찾는다는 말이고,
 * 아이콘·파비콘·OG 이미지가 전부 같은 도형을 쓴다.
 * 로고를 이미지가 아니라 컴포넌트로 두는 이유: 테마에 따라 색이 따라가야 하고, 폰트 로딩을 기다리지 않는다.
 */
export default function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-3xl sm:text-4xl' : size === 'sm' ? 'text-base' : 'text-lg'
  const glass = size === 'lg' ? 30 : size === 'sm' ? 15 : 17

  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--brand)' }}>
      <svg
        width={glass}
        height={glass}
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="43" cy="43" r="27" />
        <path d="M63 63 L86 86" />
      </svg>
      <span className={`font-extrabold tracking-tight ${text}`}>{SITE.name}</span>
    </span>
  )
}
