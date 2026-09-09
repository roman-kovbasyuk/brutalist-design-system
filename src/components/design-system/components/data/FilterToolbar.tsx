import type { ReactNode } from 'react'

export type FilterToolbarProps = {
  query: string
  onQueryChange: (query: string) => void
  children?: ReactNode
  onClear?: () => void
  resultCount?: number
  searchLabel?: string
  className?: string
}

/** A controlled search and filter composition; callers own filtering and results. */
export function FilterToolbar({ query, onQueryChange, children, onClear, resultCount, searchLabel = 'Search results', className = '' }: FilterToolbarProps) {
  return <section className={`ds-filter-toolbar ${className}`.trim()} aria-label="Filters">
    <div className="ds-filter-toolbar__controls">
      <label className="ds-filter-toolbar__search">
        <span>{searchLabel}</span>
        <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      </label>
      {children}
      {onClear && <button type="button" className="ds-filter-toolbar__clear" onClick={onClear}>Clear filters</button>}
    </div>
    {resultCount !== undefined && <p className="ds-filter-toolbar__count" role="status">{resultCount} {resultCount === 1 ? 'result' : 'results'}</p>}
  </section>
}
