import type { ReactNode } from 'react'
import { AppButton } from '../../components/actions/AppButton'
import { ActionCard } from '../../components/content/ActionCard'
import { SelectionTile } from '../../components/content/SelectionTile'
import { Table } from '../../components/data/Table'
import { ErrorState } from '../../components/feedback/ErrorState'
import { Pagination } from '../../components/navigation/Pagination'
import { SegmentedControl } from '../../components/navigation/SegmentedControl'
import { TextField } from '../../components/forms/TextField'

export type Item = { id: string; title: string; description?: string; status?: string }
export type ItemBrowserProps = {
  items: readonly Item[]; total: number; query: string; onQueryChange: (query: string) => void
  page: number; pageCount: number; onPageChange: (page: number) => void
  view: 'list' | 'grid'; onViewChange: (view: 'list' | 'grid') => void
  selectedIds: readonly string[]; onSelectionChange: (ids: string[]) => void
  loading?: boolean; error?: string; onRetry?: () => void; onOpen: (id: string) => void
  bulkActions?: ReactNode; className?: string
}

const viewOptions = [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]

/** A controlled library browser. Filtering, loading and mutations remain caller-owned. */
export function ItemBrowser({ items, total, query, onQueryChange, page, pageCount, onPageChange, view, onViewChange, selectedIds, onSelectionChange, loading = false, error, onRetry, onOpen, bulkActions, className = '' }: ItemBrowserProps) {
  const emptyMessage = query ? `No items match “${query}”.` : 'Your library is empty.'
  const selectedSet = new Set(selectedIds)
  const toggleSelection = (id: string) => onSelectionChange(selectedSet.has(id) ? selectedIds.filter((selected) => selected !== id) : [...selectedIds, id])
  return <section className={`ds-item-browser ${className}`.trim()} aria-label="Items">
    <div className="ds-item-browser__toolbar">
      <TextField type="search" label="Search items" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      <SegmentedControl ariaLabel="View items as" options={viewOptions} value={view} onValueChange={(value) => onViewChange(value as 'list' | 'grid')} />
    </div>
    {bulkActions && selectedIds.length > 0 && <div className="ds-item-browser__bulk-actions">{bulkActions}</div>}
    {error && <ErrorState title={error} description={items.length ? 'Showing the most recently available items.' : undefined} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} />}
    {loading && items.length === 0 ? <p className="ds-item-browser__message" role="status">Loading items…</p> : items.length === 0 ? <p className="ds-item-browser__message">{emptyMessage}</p> : view === 'list'
      ? <Table label="Items" rows={items} getRowId={(item) => item.id} selectedIds={selectedIds} onSelectionChange={onSelectionChange} columns={[
        { id: 'title', header: 'Title', cell: (item) => <><strong>{item.title}</strong>{item.description && <span className="ds-item-browser__description">{item.description}</span>}</> },
        { id: 'status', header: 'Status', cell: (item) => item.status ?? '—' },
        { id: 'open', header: 'Open', cell: (item) => <AppButton size="compact" variant="quiet" onClick={() => onOpen(item.id)}>Open</AppButton> },
      ]} />
      : <div className="ds-item-browser__grid">{items.map((item) => <div className="ds-item-browser__grid-item" key={item.id}>
        <SelectionTile label={item.title} selected={selectedSet.has(item.id)} onChange={() => toggleSelection(item.id)} caption={item.status}><strong>{item.title}</strong>{item.description && <span>{item.description}</span>}</SelectionTile>
        <AppButton size="compact" variant="quiet" onClick={() => onOpen(item.id)}>Open {item.title}</AppButton>
      </div>)}</div>}
    <footer className="ds-item-browser__footer"><span>{total} {total === 1 ? 'item' : 'items'}</span><Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} /></footer>
  </section>
}
