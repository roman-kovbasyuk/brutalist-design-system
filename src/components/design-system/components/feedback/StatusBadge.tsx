import type { ReactNode } from 'react'

export type FeedbackTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export type StatusBadgeProps = {
  children: ReactNode
  tone?: FeedbackTone
  className?: string
}

/** A compact, text-first status indicator. */
export function StatusBadge({ children, tone = 'neutral', className = '' }: StatusBadgeProps) {
  return <span className={`ds-status-badge ${className}`.trim()} data-tone={tone}>{children}</span>
}
