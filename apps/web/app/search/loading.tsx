import { ResultCardSkeleton } from '@/components/ResultCard'

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="skeleton mb-4 h-4 w-56 rounded" />
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <ResultCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
