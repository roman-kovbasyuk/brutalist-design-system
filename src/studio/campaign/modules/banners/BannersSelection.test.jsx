import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import { projectModuleInput } from '../../moduleContracts.js'
import BannersModule from './BannersModule.jsx'

function setup(overrides = {}) {
  const { workspace, templates } = makeScenario('visuals-ready')
  workspace.directions[0].scope = 'campaign'
  const port = { input: projectModuleInput('banners', workspace, { templates }), inputKey: 'source', access: { canEdit: true }, operation: { kind: 'idle' },
    actions: { saveBatch: vi.fn().mockResolvedValue({ ok: true, reviewInputKey: 'saved-composition' }), prepareReview: vi.fn().mockResolvedValue({ ok: true }) },
    assets: { getAssetBlob: vi.fn().mockRejectedValue(new Error('Image offline')) }, setDirty: vi.fn(), navigate: vi.fn(), ...overrides }
  return { port, ...render(<BannersModule port={port} />) }
}
const selectAll = () => fireEvent.click(screen.getByRole('button', { name: 'Select all designs' }))
const openConfirmation = () => fireEvent.click(screen.getByRole('button', { name: 'Send to Figma' }))

describe('Banners selection module', () => {
  it('renders empty guidance with valid paragraph structure and never generates assets', () => {
    const { container } = setup({ input: { templates: [], composition: null, copies: [], directions: [] } })
    expect(screen.getByText('Choose copy and a ready visual to preview your banners.')).toBeInTheDocument()
    expect(container.querySelector('p p')).toBeNull()
  })
  it('uses Design and Sizes & formats tabs, all available templates and no text editor', () => {
    setup()
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Design', 'Sizes & formats'])
    expect(screen.getAllByRole('button', { name: /^Select (Editorial split|Product spotlight|Bold announcement)$/ })).toHaveLength(3)
    expect(screen.queryByLabelText('Headline')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to Figma' })).toBeDisabled()
  })
  it('counts designs times sizes, keeps selection through tab and category changes', () => {
    setup()
    selectAll()
    fireEvent.click(screen.getByRole('tab', { name: 'Sizes & formats' }))
    fireEvent.click(screen.getByRole('button', { name: /Select .*1080 × 1920/ }))
    expect(screen.getByRole('status', { name: 'Banner selection total' })).toHaveTextContent('3 designs × 2 sizes')
    expect(screen.getByRole('status', { name: 'Banner selection total' })).toHaveTextContent('6')
    fireEvent.click(screen.getByRole('button', { name: 'Placement category' }))
    fireEvent.click(screen.getByRole('option', { name: 'Stories' }))
    expect(screen.getByRole('button', { name: /Deselect .*1080 × 1920/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Design' }))
    expect(screen.getByRole('button', { name: 'Deselect Editorial split' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('does not save before verification; cancellation is harmless', () => {
    const { port } = setup()
    selectAll(); openConfirmation()
    const dialog = screen.getByRole('dialog', { name: 'Verify your banners' })
    expect(dialog).toHaveTextContent('3 designs × 1 size')
    expect(dialog).toHaveTextContent(/Import the PNGs into Figma/)
    expect(port.actions.saveBatch).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to selection' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(port.actions.saveBatch).not.toHaveBeenCalled()
  })
  it('saves every selection with its captured source key before preparing review', async () => {
    const { port } = setup()
    selectAll(); openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and prepare review' }))
    await waitFor(() => expect(port.navigate).toHaveBeenCalledWith('review'))
    const [request, options] = port.actions.saveBatch.mock.calls[0]
    expect(request.designs).toHaveLength(3)
    expect(request.designs[0]).toEqual({ templateId: 'editorial-split', templateVersion: port.input.templates[0].version, copySetId: 'copy-set-1', copyId: 'copy-1', directionId: 'direction-1' })
    expect(request.ratioIds).toEqual(['square'])
    expect(options).toEqual({ expectedInputKey: 'source' })
    expect(port.actions.prepareReview).toHaveBeenCalledTimes(1)
    expect(port.actions.prepareReview).toHaveBeenCalledWith({ expectedInputKey: 'saved-composition' })
  })
  it('keeps drafts and the original source key after save failure and unrelated refresh', async () => {
    const { port, rerender } = setup()
    port.actions.saveBatch.mockResolvedValue({ ok: false, message: 'Source conflict' })
    selectAll(); openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and prepare review' }))
    await screen.findByText('Source conflict')
    expect(port.actions.prepareReview).not.toHaveBeenCalled()
    expect(port.setDirty).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Back to selection' }))
    rerender(<BannersModule port={{ ...port, inputKey: 'new-source' }} />)
    expect(screen.getByRole('button', { name: 'Deselect Editorial split' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/The source changed/)).toBeInTheDocument()
    expect(port.actions.saveBatch.mock.calls[0][1]).toEqual({ expectedInputKey: 'source' })
  })
  it('does not resave a confirmed batch when review preparation is retried', async () => {
    const { port } = setup()
    port.actions.prepareReview.mockResolvedValueOnce({ ok: false, message: 'Render failed' }).mockResolvedValueOnce({ ok: true })
    selectAll(); openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and prepare review' }))
    await screen.findByText('Render failed')
    fireEvent.click(screen.getByRole('button', { name: 'Retry review preparation' }))
    await waitFor(() => expect(port.navigate).toHaveBeenCalledWith('review'))
    expect(port.actions.saveBatch).toHaveBeenCalledTimes(1)
    expect(port.actions.prepareReview).toHaveBeenLastCalledWith({ expectedInputKey: 'saved-composition' })
  })
  it('never exposes write actions for read-only campaigns', () => {
    setup({ access: { canEdit: false } })
    expect(screen.getByRole('button', { name: 'Select all designs' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select Editorial split' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Send to Figma' })).not.toBeInTheDocument()
  })
  it('names a failed design and size and retains the selection for correction', async () => {
    const { port } = setup()
    port.actions.saveBatch.mockResolvedValue({ ok: false, code: 'invalid_composition', message: 'Choose shorter copy or another design.',
      details: [{ templateId: 'editorial-split', ratioId: 'square', slotId: 'headline', message: 'Headline does not fit.' }] })
    selectAll(); openConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and prepare review' }))
    const issues = await screen.findByRole('list', { name: 'Banner validation issues' })
    expect(issues).toHaveTextContent('Editorial split')
    expect(issues).toHaveTextContent('1080 × 1080')
    expect(issues).toHaveTextContent('Headline does not fit.')
    expect(port.actions.prepareReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to selection' }))
    expect(screen.getByRole('button', { name: 'Deselect Editorial split' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Banner validation issues' })).toBeInTheDocument()
  })
  it('loads historical manifests so saved custom dimensions remain selectable', async () => {
    const { workspace, templates } = makeScenario('composed')
    const input = projectModuleInput('banners', workspace, { templates })
    const historic = { ...templates[0], version: 'old', manifest: { ...templates[0].manifest, ratios: [{ id: 'custom-old', width: 600, height: 400 }] } }
    input.composition = { ...input.composition, templateId: historic.id, templateVersion: 'old', ratioIds: ['custom-old'], designs: [{ templateId: historic.id, templateVersion: 'old', copySetId: 'copy-set-1', copyId: 'copy-1', directionId: 'direction-1' }] }
    const loadTemplateVersion = vi.fn().mockResolvedValue(historic)
    setup({ input, actions: { loadTemplateVersion, saveBatch: vi.fn(), prepareReview: vi.fn() } })
    fireEvent.click(screen.getByRole('tab', { name: 'Sizes & formats' }))
    expect(await screen.findByRole('button', { name: /Deselect custom-old · 600 × 400/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to Figma' })).toBeEnabled()
    expect(loadTemplateVersion).toHaveBeenCalledWith(historic.id, 'old')
  })
})
