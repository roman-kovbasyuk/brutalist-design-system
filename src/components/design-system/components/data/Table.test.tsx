import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BulkActionBar } from './BulkActionBar'
import { FilterToolbar } from './FilterToolbar'
import { Table } from './Table'

type Item = { id: string; name: string; status: string }

const rows: Item[] = [
  { id: 'alpha', name: 'Alpha', status: 'Ready' },
  { id: 'bravo', name: 'Bravo', status: 'Draft' },
]

const columns = [
  { id: 'name', header: 'Name', cell: (row: Item) => row.name, sortable: true },
  { id: 'status', header: 'Status', cell: (row: Item) => row.status },
]

function FilterFixture({ onQueryChange, onClear }: { onQueryChange: (query: string) => void; onClear: () => void }) {
  const [query, setQuery] = useState('draft')
  return <FilterToolbar query={query} onQueryChange={(value) => { setQuery(value); onQueryChange(value) }} onClear={onClear} resultCount={2}><button type="button">Status filter</button></FilterToolbar>
}

describe('portable data components', () => {
  it('requests sorting through the owning caller and exposes aria-sort', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    render(<Table label="Items" rows={rows} columns={columns} getRowId={(row) => row.id} sort={{ columnId: 'name', direction: 'asc' }} onSortChange={onSortChange} />)

    const name = screen.getByRole('columnheader', { name: 'Name' })
    expect(name).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'name', direction: 'desc' })
  })

  it('selects current rows only and keeps selection bound to row identity after a reorder', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    const view = render(<Table label="Items" rows={rows} columns={columns} getRowId={(row) => row.id} selectedIds={['off-page']} onSelectionChange={onSelectionChange} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select all rows' }))
    expect(onSelectionChange).toHaveBeenCalledWith(['off-page', 'alpha', 'bravo'])
    view.rerender(<Table label="Items" rows={[...rows].reverse()} columns={columns} getRowId={(row) => row.id} selectedIds={['bravo']} onSelectionChange={onSelectionChange} />)
    expect(screen.getByRole('checkbox', { name: 'Select row bravo' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select row alpha' })).not.toBeChecked()
  })

  it('marks mixed selection as indeterminate and clears only visible rows', () => {
    const { rerender } = render(<Table label="Items" rows={rows} columns={columns} getRowId={(row) => row.id} selectedIds={['alpha']} onSelectionChange={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toBePartiallyChecked()
    rerender(<Table label="Items" rows={[]} columns={columns} getRowId={(row) => row.id} selectedIds={['alpha']} onSelectionChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toBeDisabled()
  })

  it('keeps filter and bulk actions controlled by the caller', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()
    const onClearFilters = vi.fn()
    const onClearSelection = vi.fn()
    render(<>
      <FilterFixture onQueryChange={onQueryChange} onClear={onClearFilters} />
      <BulkActionBar count={2} onClear={onClearSelection}><button type="button">Archive</button></BulkActionBar>
    </>)

    await user.clear(screen.getByRole('searchbox', { name: 'Search results' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search results' }), 'ready')
    expect(onQueryChange).toHaveBeenLastCalledWith('ready')
    expect(screen.getByRole('status')).toHaveTextContent('2 results')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
    expect(onClearSelection).toHaveBeenCalledTimes(1)
  })
})
