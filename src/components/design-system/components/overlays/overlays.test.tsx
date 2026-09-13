import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pin } from 'lucide-react'
import { Dialog, Drawer, Menu, Popover, Tooltip } from './index'

describe('portable overlays', () => {
  it('uses medium typography for menu items', () => {
    const styles = readFileSync(join(process.cwd(), 'src/components/design-system/components/overlays/overlays.css'), 'utf8')
    expect(styles).toMatch(/\.ds-menu__item\s*{[^}]*font-weight:\s*500;/)
  })

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

  it('renders an optional leading icon for menu items', () => {
    render(<Menu open onOpenChange={vi.fn()} trigger="Actions" items={[{ id: 'pin', label: 'Pin', icon: <Pin data-testid="pin-icon" /> }]} onSelect={vi.fn()} />)

    expect(screen.getByTestId('pin-icon')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toHaveClass('ds-menu__item--with-icon')
  })

  it('supports an explicit menu side for footer actions', () => {
    render(<Menu open onOpenChange={vi.fn()} trigger="Account" side="top" items={[{ id: 'settings', label: 'Settings' }]} onSelect={vi.fn()} />)

    expect(screen.getByRole('menu')).toHaveAttribute('data-side', 'top')
  })
})
