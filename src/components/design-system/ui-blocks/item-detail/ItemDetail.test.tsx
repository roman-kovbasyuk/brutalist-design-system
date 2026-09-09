import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemDetail } from './ItemDetail'

const item = { id: 'guide', revision: '1', title: 'Getting started', description: 'Practical guidance.' }

describe('ItemDetail', () => {
  it('renders missing, loading, error, ready and read-only states', () => {
    const save = vi.fn().mockResolvedValue({ ok: true })
    const { rerender } = render(<ItemDetail onSave={save} />)
    expect(screen.getByText('No item selected.')).toBeInTheDocument()
    rerender(<ItemDetail loading onSave={save} />)
    expect(screen.getByText('Loading item…')).toBeInTheDocument()
    rerender(<ItemDetail error="Could not load item" onRetry={vi.fn()} onSave={save} />)
    expect(screen.getByRole('heading', { name: 'Could not load item' })).toBeInTheDocument()
    rerender(<ItemDetail item={item} onSave={save} metadata={<span>Owned by Ari</span>} preview={<div>Preview</div>} />)
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument()
    expect(screen.getByText('Owned by Ari')).toBeInTheDocument()
    rerender(<ItemDetail item={item} readOnly onSave={save} />)
    expect(screen.queryByRole('button', { name: 'Edit title' })).not.toBeInTheDocument()
  })

  it('preserves a rejected title draft and submits the revision captured for this detail session', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue({ ok: false, message: 'This item changed. Your edit is preserved.' })
    const view = render(<ItemDetail item={item} onSave={save} />)
    await user.click(screen.getByRole('button', { name: 'Edit title' }))
    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Draft guide')
    view.rerender(<ItemDetail item={{ ...item, revision: '2' }} onSave={save} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledWith({ title: 'Draft guide' }, '1')
    expect(await screen.findByRole('alert')).toHaveTextContent('This item changed. Your edit is preserved.')
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft guide')
  })
})
