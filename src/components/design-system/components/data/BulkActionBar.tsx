import type { ReactNode } from 'react'

export type BulkActionBarProps = {
  count: number
  children?: ReactNode
  onClear: () => void
  className?: string
}

/** A visible selection summary with caller-supplied bulk actions. */
export function BulkActionBar({ count, children, onClear, className = '' }: BulkActionBarProps) {
  return <section className={`ds-bulk-action-bar ${className}`.trim()} aria-label="Bulk actions">
    <p><strong>{count}</strong> {count === 1 ? 'item selected' : 'items selected'}</p>
    <div className="ds-bulk-action-bar__actions">{children}<button type="button" onClick={onClear}>Clear selection</button></div>
  </section>
}
