import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, Drawer, Menu, Popover, Tooltip } from './index'

describe('portable overlays', () => {
  it('keeps dialog state controlled and reports Escape dismissal', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(<Dialog open onOpenChange={onOpenChange} title="Delete draft">This cannot be undone.</Dialog>)

    expect(screen.getByRole('dialog', { name: 'Delete draft' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders a controlled drawer with an accessible title', () => {
    render(<Drawer open onOpenChange={vi.fn()} title="Filters" side="right">Filter options</Drawer>)

    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeVisible()
  })

  it('opens a controlled popover from its labelled trigger', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Popover open={false} onOpenChange={onOpenChange} trigger="More options">Preview options</Popover>)

    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('shows a tooltip on keyboard focus', async () => {
    const user = userEvent.setup()
    render(<Tooltip content="Copies the current code"><button type="button">Copy</button></Tooltip>)

    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Copies the current code')
  })

  it('sends the selected menu item to its owner', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Menu open onOpenChange={vi.fn()} trigger="Actions" items={[{ id: 'duplicate', label: 'Duplicate' }]} onSelect={onSelect} />)

    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(onSelect).toHaveBeenCalledWith('duplicate')
  })
})
