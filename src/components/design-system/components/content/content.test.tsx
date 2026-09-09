import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionCard } from './ActionCard'
import { FactGrid } from './FactGrid'
import { InlineText } from './InlineText'
import { SelectionTile } from './SelectionTile'

describe('portable content components', () => {
  it('keeps ActionCard content semantic while exposing supplied actions', () => {
    render(<ActionCard label="Draft" actions={<button>Open</button>}><h3>Campaign brief</h3></ActionCard>)

    expect(screen.getByRole('article', { name: 'Draft' })).toHaveTextContent('Campaign brief')
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('renders FactGrid values as a labelled definition list', () => {
    render(<FactGrid label="Project details" items={[{ id: 'owner', label: 'Owner', value: 'Ari' }]} />)

    expect(screen.getByRole('group', { name: 'Project details' })).toHaveTextContent('Owner')
    expect(screen.getByText('Ari')).toBeInTheDocument()
  })

  it('reports SelectionTile selection through a toggle button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectionTile label="Warm" selected onChange={onChange}>Warm palette</SelectionTile>)

    const tile = screen.getByRole('button', { name: 'Deselect Warm' })
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    await user.click(tile)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('saves a changed InlineText value and restores its trigger', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<InlineText label="Title" value="Original" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Edit title' }))
    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Updated')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith('Updated')
    expect(await screen.findByRole('button', { name: 'Edit title' })).toHaveTextContent('Updated')
  })
})
