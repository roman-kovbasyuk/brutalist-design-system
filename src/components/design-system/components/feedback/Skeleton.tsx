export type SkeletonProps = {
  lines?: number
  className?: string
}

/** Decorative loading placeholders. Pair with nearby loading text when needed. */
export function Skeleton({ lines = 1, className = '' }: SkeletonProps) {
  return <div className={`ds-skeleton ${className}`.trim()}>{Array.from({ length: Math.max(1, lines) }, (_, index) => <span key={index} className="ds-skeleton__line" aria-hidden="true" />)}</div>
}
