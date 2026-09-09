import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemBrowser, type Item } from './ItemBrowser'

const items: Item[] = [
  { id: 'guide', title: 'Getting started guide', description: 'A practical introduction.', status: 'Ready' },
  { id: 'kit', title: 'Brand kit', description: 'Shared visual assets.', status: 'Draft' },
]

function BrowserFixture({ onQueryChange = vi.fn(), onSelectionChange = vi.fn() }: {
  onQueryChange?: (query: string) => void
  onSelectionChange?: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  return <ItemBrowser items={items} total={2} query={query} onQueryChange={(value) => { setQuery(value); onQueryChange(value) }}
    page={1} pageCount={2} onPageChange={vi.fn()} view={view} onViewChange={setView} selectedIds={selectedIds}
    onSelectionChange={(ids) => { setSelectedIds(ids); onSelectionChange(ids) }} onOpen={vi.fn()} />
}

describe('ItemBrowser', () => {
  it('keeps query, view and selection caller-controlled with stable item IDs', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()
    const onSelectionChange = vi.fn()
    render(<BrowserFixture onQueryChange={onQueryChange} onSelectionChange={onSelectionChange} />)

    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'Guide')
    expect(onQueryChange).toHaveBeenLastCalledWith('Guide')
    await user.click(screen.getByRole('radio', { name: 'Grid' }))
    await user.click(screen.getByRole('button', { name: 'Select Getting started guide' }))
    expect(onSelectionChange).toHaveBeenLastCalledWith(['guide'])
    await user.click(screen.getByRole('radio', { name: 'List' }))
    expect(screen.getByRole('checkbox', { name: 'Select row guide' })).toBeChecked()
  })

  it('keeps retained data visible with an error and distinguishes loading, empty library and no matches', () => {
    const base = { total: 0, query: '', onQueryChange: vi.fn(), page: 1, pageCount: 1, onPageChange: vi.fn(), view: 'list' as const, onViewChange: vi.fn(), selectedIds: [], onSelectionChange: vi.fn(), onOpen: vi.fn() }
    const { rerender } = render(<ItemBrowser {...base} items={items} error="Could not refresh" onRetry={vi.fn()} />)
    expect(screen.getByText('Getting started guide')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Could not refresh' })).toBeInTheDocument()
    rerender(<ItemBrowser {...base} items={[]} loading />)
    expect(screen.getByText('Loading items…')).toBeInTheDocument()
    rerender(<ItemBrowser {...base} items={[]} />)
    expect(screen.getByText('Your library is empty.')).toBeInTheDocument()
    rerender(<ItemBrowser {...base} items={[]} query="nothing" />)
    expect(screen.getByText('No items match “nothing”.')).toBeInTheDocument()
  })
})
