import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ModuleHarness } from '../../testing/ModuleHarness.jsx'
import { makeScenario } from '../../testing/workspaceFixtures.js'

describe('Copy cards', () => {
  test('an approved card can explicitly restore the banner selection after deletion', async () => {
    const scenario = makeScenario('copy-ready')
    scenario.workspace.copies[0].approvedCandidateIds = ['copy-1', 'copy-2']
    const approve = vi.fn()
    render(<ModuleHarness moduleId="copy" scenario={scenario} actions={{ approve }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Use option 2 for banners' }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith('copy-2'))
  })
  test('a changed brief surfaces stale-source guidance', async () => {
    const scenario = makeScenario('copy-ready')
    scenario.workspace.copies[0].stale = true
    render(<ModuleHarness moduleId="copy" scenario={scenario} />)
    expect(await screen.findByText(/The brief has changed/)).toBeVisible()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    // A current analysis may already exist after a failed first generation.
    // The server verifies freshness; stale prior sets must not disable retry.
    expect(screen.getByRole('button', { name: 'Generate More Options' })).toBeEnabled()
  })
  test('empty state waits for Brief without extra generation', async () => {
    render(<ModuleHarness moduleId="copy" scenario={makeScenario('draft')} />)
    expect(await screen.findByText('Add a brief to generate banner copy.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument()
  })
  test('cards invoke independent approval and delete actions without view tabs', async () => {
    const approve = vi.fn(), remove = vi.fn()
    render(<ModuleHarness moduleId="copy" scenario={makeScenario('copy-ready')} actions={{ approve, remove }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve option 1' }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith('copy-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete option 2' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('copy-2'))
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  test('appending preserves approvals and order with global numbering', async () => {
    const scenario = makeScenario('copy-ready')
    scenario.workspace.copies[0].approvedCandidateIds = ['copy-1', 'copy-2']
    scenario.workspace.copies[0].selectedCandidateId = 'copy-1'
    scenario.workspace.campaign.selectedCopyId = scenario.workspace.copies[0].id
    const generate = vi.fn(), regenerate = vi.fn()
    const view = render(<ModuleHarness moduleId="copy" scenario={scenario} actions={{ generate, regenerate }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Generate More Options' }))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    expect(regenerate).not.toHaveBeenCalled()
    scenario.workspace.copies = [...scenario.workspace.copies, { id: 'set-2', candidates: [{ ...scenario.workspace.copies[0].candidates[0], id: 'copy-3', headline: 'New angle' }], approvedCandidateIds: [], stale: false }]
    view.rerender(<ModuleHarness moduleId="copy" scenario={scenario} />)
    expect(screen.getAllByRole('article').map(card => within(card).getByRole('heading').textContent)).toEqual(['Find your quiet', 'Sound for your day', 'New angle'])
    expect(screen.getByRole('button', { name: 'Approve option 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Approve option 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Preview option 3' })).toBeVisible()
  })
  test('previews only the chosen card without generation', async () => {
    const generate = vi.fn(), assets = { getAssetBlob: vi.fn() }
    render(<ModuleHarness moduleId="copy" scenario={makeScenario('copy-ready')} actions={{ generate }} assets={assets} />)
    const preview = await screen.findByRole('button', { name: 'Preview option 2' })
    expect(assets.getAssetBlob).not.toHaveBeenCalled()
    preview.focus()
    fireEvent.click(preview)
    const dialog = await screen.findByRole('dialog', { name: 'Option 2 preview' })
    expect(await within(dialog).findByRole('img')).toBeVisible()
    expect(within(dialog).getByText('Sound for your day')).toBeVisible()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(preview).toHaveFocus()
    expect(generate).not.toHaveBeenCalled()
  })
  test('generation stops at 30 visible cards and resumes after removal', async () => {
    const scenario = makeScenario('copy-ready')
    scenario.workspace.copies[0].candidates = Array.from({ length: 30 }, (_, i) => ({ ...scenario.workspace.copies[0].candidates[0], id: `copy-${i}`, headline: `Headline ${i}` }))
    const view = render(<ModuleHarness moduleId="copy" scenario={scenario} />)
    expect(await screen.findByRole('button', { name: 'Generate More Options' })).toBeDisabled()
    scenario.workspace.copies = [{ ...scenario.workspace.copies[0], candidates: scenario.workspace.copies[0].candidates.slice(0, 29) }]
    view.rerender(<ModuleHarness moduleId="copy" scenario={scenario} />)
    expect(screen.getByRole('button', { name: 'Generate More Options' })).toBeEnabled()
    await waitFor(() => expect(screen.getAllByRole('article', { hidden: true })).toHaveLength(29))
  })
  test('stale cards are hidden and locked campaigns cannot be edited', async () => {
    const scenario = makeScenario('in-review')
    scenario.workspace.copies.push({ id: 'stale-set', stale: true, candidates: [{ id: 'old-copy', headline: 'Old draft' }] })
    render(<ModuleHarness moduleId="copy" scenario={scenario} />)
    await screen.findByRole('button', { name: 'Preview option 1' })
    expect(screen.queryByText('Old draft')).not.toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: /Approve option|Delete option/ })) expect(button).toBeDisabled()
  })
  test('failed deletion retains the card and exposes a local error', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('Connection lost'))
    render(<ModuleHarness moduleId="copy" scenario={makeScenario('copy-ready')} actions={{ remove }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete option 1' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Connection lost'))
    expect(screen.getByRole('heading', { name: 'Find your quiet' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete option 1' })).toBeEnabled()
  })
})
