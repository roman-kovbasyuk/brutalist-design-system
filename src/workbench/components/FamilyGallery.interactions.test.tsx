import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FamilyGallery } from './FamilyGallery'
import { DesignSystemWorkbench } from '../DesignSystemWorkbench'
import { entries } from '../registry/entries'
import { families } from '../registry/families'

function showFamily(id: string) {
  return render(<FamilyGallery family={families.find((family) => family.id === id)!} entries={entries} />)
}

describe('live gallery interactions', () => {
  it('opens a dialog, dismisses with Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    showFamily('overlays')
    expect(screen.getByRole('region', { name: 'Dialogs and drawers' })).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Archive draft' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('opens and dismisses the independent popover example', async () => {
    const user = userEvent.setup()
    showFamily('overlays')
    const trigger = screen.getByRole('button', { name: 'More options' })
    await user.click(trigger)
    expect(screen.getByText('Use this surface for short, contextual actions.')).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Use this surface for short, contextual actions.')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('updates the controlled checkbox', async () => {
    const user = userEvent.setup()
    showFamily('inputs')
    const checkbox = screen.getByRole('checkbox', { name: 'Send release notes' })
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('updates the selected combobox value', async () => {
    const user = userEvent.setup()
    showFamily('selection')
    await user.click(screen.getByRole('combobox', { name: 'Visual direction' }))
    await user.click(screen.getByRole('option', { name: 'Warm' }))
    expect(screen.getByRole('combobox', { name: 'Visual direction' })).toHaveValue('Warm')
  })

  it('toggles a selection tile without touching another specimen', async () => {
    const user = userEvent.setup()
    const tile = entries.find((entry) => entry.id === 'selection-tile')!
    render(<FamilyGallery family={families.find((family) => family.id === 'content')!}
      entries={[tile, { ...tile, id: 'another-tile', examples: tile.examples.map((example) => ({ ...example, id: 'another-example' })) }]} />)
    const tiles = screen.getAllByRole('button', { name: 'Select Graphic poster' })
    await user.click(tiles[0])
    expect(tiles[0]).toHaveAttribute('aria-pressed', 'true')
    expect(tiles[1]).toHaveAttribute('aria-pressed', 'false')
    await user.click(tiles[1])
    expect(tiles[0]).toHaveAttribute('aria-pressed', 'true')
    expect(tiles[1]).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the selected tab panel and preserves its label association', async () => {
    const user = userEvent.setup()
    showFamily('navigation')
    await user.click(screen.getByRole('tab', { name: 'Code' }))
    const panel = screen.getByRole('tabpanel', { name: 'Code' })
    expect(panel).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps prompt edits local and resets the draft when leaving its family', async () => {
    const user = userEvent.setup()
    history.replaceState({}, '', '/design-system?mode=workbench&section=ui-blocks&family=ai-workspace')
    render(<DesignSystemWorkbench />)
    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    await user.clear(prompt)
    await user.type(prompt, 'Private local draft')
    expect(prompt).toHaveValue('Private local draft')
    expect(window.location.href).not.toContain('Private')
    const nav = screen.getByRole('navigation', { name: 'UI blocks families' })
    await user.click(within(nav).getByRole('link', { name: 'Settings' }))
    await user.click(within(nav).getByRole('link', { name: 'AI workspace' }))
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue('Create three bold launch directions.')
  })

  it('shows and removes selected local files without pretending to upload', async () => {
    const user = userEvent.setup()
    showFamily('files')
    await user.upload(screen.getByLabelText('Add source files'), new File(['sample'], 'sample.png', { type: 'image/png' }))
    expect(screen.getByRole('list', { name: 'Selected files' })).toHaveTextContent('sample.png')
    expect(screen.getByText(/no files are uploaded/i)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove sample.png' }))
    expect(screen.queryByRole('list', { name: 'Selected files' })).not.toBeInTheDocument()
  })

  it('filters browser items and retains selections across view changes', async () => {
    const user = userEvent.setup()
    showFamily('item-browser')
    await user.click(screen.getByRole('checkbox', { name: 'Select row poster' }))
    expect(screen.getByRole('checkbox', { name: 'Select row poster' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Grid' }))
    expect(screen.getByRole('button', { name: 'Deselect Launch poster' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'Web')
    expect(screen.queryByRole('button', { name: 'Deselect Launch poster' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Web banner' })).toBeVisible()
    await user.clear(screen.getByRole('searchbox', { name: 'Search items' }))
    expect(screen.getByRole('button', { name: 'Deselect Launch poster' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Open Launch poster' }))
    expect(screen.getByRole('status', { name: 'Item preview' })).toHaveTextContent(/preview.*Launch poster/i)
  })

  it('identifies AI task actions as local demonstrations', async () => {
    const user = userEvent.setup()
    showFamily('ai-workspace')
    await user.click(screen.getByRole('button', { name: 'Run task' }))
    expect(screen.getByText(/no AI request was sent/i)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByText(/no changes were applied/i)).toBeVisible()
  })
})
