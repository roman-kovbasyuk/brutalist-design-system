import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import VisualsModule from './VisualsModule.jsx'

const copy = { id: 'copy-1', headline: 'Find your quiet', visualPrompt: 'Blue headphones in soft daylight.', approved: true }
function port(overrides = {}) {
  return { input: { copies: [copy], analysis: { summary: 'A quieter commute.' }, directions: [], selectedDirectionId: null },
    access: { canEdit: true }, operation: { kind: 'idle' }, assets: { getAssetBlob: vi.fn(async () => new Blob(['image'], { type: 'image/png' })) },
    actions: { generate: vi.fn(async () => ({ ok: true })), generateAll: vi.fn(), image: vi.fn(), select: vi.fn(), upload: vi.fn(async () => ({ ok: true })) },
    reconcile: vi.fn(async () => {}), navigate: vi.fn(), ...overrides }
}

test('uncertain automatic prompts offer a prompt-only retry, never image generation', async () => {
  const value = port({ operation: { kind: 'uncertain', actionId: 'prepare-prompts', error: { message: 'Response lost' } } })
  value.actions.preparePrompts = vi.fn()
  render(<VisualsModule port={value} />)
  await userEvent.click(screen.getByRole('button', { name: 'Retry prompt request' }))
  expect(value.actions.preparePrompts).toHaveBeenCalledWith({ retry: true })
  expect(value.actions.generate).not.toHaveBeenCalled()
  expect(value.actions.image).not.toHaveBeenCalled()
})

test('announces fallback progress while prompt preparation has no detailed progress', () => {
  const value = port({ operation: { kind: 'running', actionId: 'prepare-prompts', error: null } })
  render(<VisualsModule port={value} />)
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('Working on visuals…')
})

test('replaces fallback progress with detailed generation progress', async () => {
  let finish
  const value = port()
  value.actions.generate.mockImplementation(async (_mode, { onProgress }) => {
    onProgress({ stage: 'prompts', total: 3, current: 0 })
    return new Promise(resolve => { finish = resolve })
  })
  const user = userEvent.setup()
  const rendered = render(<VisualsModule port={value} />)
  await user.click(screen.getByRole('button', { name: 'Generate campaign-wide visuals' }))
  rendered.rerender(<VisualsModule port={{ ...value, operation: { kind: 'running', actionId: 'generate:campaign', error: null } }} />)
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('Creating prompts for 3 visuals…')
  finish({ ok: true })
})

test('locates an image operation error in its owning card', () => {
  const value = port({ operation: { kind: 'failed', actionId: 'image:d1', error: { message: 'The image provider timed out.' } } })
  value.input.directions = [{ id: 'd1', title: 'Timed out idea', prompt: 'Prompt', scope: 'campaign', status: 'pending' }]
  render(<VisualsModule port={value} />)
  const card = screen.getByRole('article', { name: 'Timed out idea' })
  expect(within(card).getByRole('alert')).toHaveTextContent('The image provider timed out.')
  expect(screen.getAllByRole('alert')).toHaveLength(1)
})

test('keeps a persisted campaign upload error visible after remount', () => {
  const value = port({ operation: { kind: 'failed', actionId: 'upload:campaign', error: { message: 'The saved upload failed.' } } })
  render(<VisualsModule port={value} />)
  expect(screen.getByRole('alert')).toHaveTextContent('The saved upload failed.')
  expect(screen.getAllByRole('alert')).toHaveLength(1)
})

test('falls back to a module error when an image operation has no owning card', () => {
  const value = port({ operation: { kind: 'failed', actionId: 'image:missing', error: { message: 'The missing image failed.' } } })
  render(<VisualsModule port={value} />)
  expect(screen.getByRole('alert')).toHaveTextContent('The missing image failed.')
})

test('reconciles and clears a transient upload error from the module boundary', async () => {
  const value = port()
  value.actions.upload.mockResolvedValue({ ok: false, message: 'Upload needs checking.' })
  const user = userEvent.setup()
  render(<VisualsModule port={value} />)
  await user.click(screen.getAllByRole('button', { name: 'Upload visual' })[1])
  await user.upload(screen.getByLabelText('Upload image file'), new File(['image'], 'image.png', { type: 'image/png' }))
  await user.click(screen.getByRole('button', { name: 'Check latest state' }))
  expect(value.reconcile).toHaveBeenCalledOnce()
  expect(screen.queryByText('Upload needs checking.')).not.toBeInTheDocument()
})

test('an older upload completion cannot replace feedback from a newer attempt', async () => {
  const completions = []
  const value = port()
  value.actions.upload.mockImplementation(() => new Promise(resolve => completions.push(resolve)))
  const user = userEvent.setup()
  render(<VisualsModule port={value} />)
  const upload = async name => {
    await user.click(screen.getAllByRole('button', { name: 'Upload visual' })[1])
    await user.upload(screen.getByLabelText('Upload image file'), new File(['image'], name, { type: 'image/png' }))
  }
  await upload('first.png')
  await upload('second.png')
  await act(async () => completions[1]({ ok: false, message: 'Second upload failed.' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Second upload failed.')
  await act(async () => completions[0]({ ok: false, message: 'First upload failed late.' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Second upload failed.')
})

test('empty visuals shows prerequisite guidance and sends no generation on mount', () => {
  const value = port({ input: { copies: [], analysis: null, directions: [] } })
  render(<VisualsModule port={value} />)
  expect(screen.getByText('Analyze your brief to prepare visual prompts.')).toBeInTheDocument()
  expect(value.actions.generate).not.toHaveBeenCalled()
})

test('ready methods expose selected count; campaign method works without selection', async () => {
  const value = port({ input: { copies: [{ ...copy, approved: false }], directions: [] } })
  const user = userEvent.setup()
  render(<VisualsModule port={value} />)
  expect(screen.getByText('0 copy options selected')).toBeInTheDocument()
  expect(screen.getByText('Approve options in Copy to select them for visuals.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate visuals for selected copy' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Generate campaign-wide visuals' }))
  expect(value.actions.generate).toHaveBeenCalledWith('campaign', expect.objectContaining({ onProgress: expect.any(Function) }))
})

test('selected method immediately forwards a generation action and offers upload alternatives', async () => {
  const value = port()
  const user = userEvent.setup()
  render(<VisualsModule port={value} />)
  expect(screen.getByText('1 copy option selected')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Generate visuals for selected copy' }))
  expect(value.actions.generate).toHaveBeenCalledWith('selected_copy', expect.anything())
  expect(screen.getAllByRole('button', { name: 'Upload visual' })).toHaveLength(2)
})

test('three-column results preserve their copy context and copy exact prompt text', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  const value = port()
  value.input.directions = [{ id: 'd1', title: 'Soft daylight', prompt: 'Exact prompt.\nNo text.', scope: 'selected_copy', copy, status: 'pending' }]
  render(<VisualsModule port={value} />)
  const result = screen.getByRole('article', { name: 'Soft daylight' })
  expect(within(result).getByText('Find your quiet')).toBeInTheDocument()
  for (const name of ['Prompt', 'Static visual', 'Video']) expect(within(result).getByRole('heading', { name })).toBeInTheDocument()
  await user.click(within(result).getByRole('button', { name: 'Copy prompt' }))
  expect(write).toHaveBeenCalledWith('Exact prompt.\nNo text.')
  expect(within(result).getByText('Copied')).toBeInTheDocument()
  expect(within(result).getByText('No video yet')).toBeInTheDocument()
})

test('uploads to the explicit direction and does not generate an image', async () => {
  const user = userEvent.setup()
  const value = port()
  value.input.directions = [{ id: 'd1', title: 'Soft daylight', prompt: 'Prompt', scope: 'campaign', status: 'pending' }]
  render(<VisualsModule port={value} />)
  const file = new File(['test'], 'visual.png', { type: 'image/png' })
  const result = screen.getByRole('article', { name: 'Soft daylight' })
  await user.click(within(result).getByRole('button', { name: 'Upload visual' }))
  await user.upload(screen.getByLabelText('Upload image file'), file)
  expect(value.actions.upload).toHaveBeenCalledWith({ directionId: 'd1' }, file)
  expect(value.actions.image).not.toHaveBeenCalled()
})

test('failed cards offer retry; bulk control excludes ready and unresolved cards', async () => {
  const user = userEvent.setup()
  const value = port()
  value.input.directions = [
    { id: 'failed', title: 'Failed idea', prompt: 'One', status: 'pending', generation: { status: 'failed' } },
    { id: 'unknown', title: 'Unresolved idea', prompt: 'Two', status: 'pending', generation: { status: 'unknown' } },
  ]
  render(<VisualsModule port={value} />)
  expect(screen.getByRole('button', { name: 'Generate All Static Visuals' })).toBeInTheDocument()
  expect(screen.getByText('1 missing visual')).toBeInTheDocument()
  await user.click(within(screen.getByRole('article', { name: 'Failed idea' })).getByRole('button', { name: 'Retry image' }))
  expect(value.actions.image).toHaveBeenCalledWith('failed')
  expect(within(screen.getByRole('article', { name: 'Unresolved idea' })).queryByRole('button', { name: 'Retry image' })).not.toBeInTheDocument()
})

test('source-changed visuals remain visible but cannot generate or be selected', () => {
  const value = port()
  value.input.directions = [{ id: 'old', title: 'Earlier visual', prompt: 'Original prompt', status: 'ready',
    stale: true, previewAssetId: 'image-old', scope: 'selected_copy', copy }]
  render(<VisualsModule port={value} />)
  const result = screen.getByRole('article', { name: 'Earlier visual' })
  expect(within(result).getByText('Source changed')).toBeInTheDocument()
  expect(within(result).getByRole('button', { name: 'Use this image' })).toBeDisabled()
  expect(within(result).getByText('Original prompt')).toBeInTheDocument()
})

test('uploaded-only cards do not invent a prompt or a copy-prompt action', () => {
  const value = port()
  value.input.directions = [{ id: 'upload', title: 'My image', prompt: '', status: 'ready', previewAssetId: 'image', source: 'upload', scope: 'campaign' }]
  render(<VisualsModule port={value} />)
  const result = screen.getByRole('article', { name: 'My image' })
  expect(within(result).getByText('No generated prompt available.')).toBeInTheDocument()
  expect(within(result).queryByRole('button', { name: 'Copy prompt' })).not.toBeInTheDocument()
  expect(within(result).getByRole('button', { name: 'Upload visual' })).toBeEnabled()
})

test('upload choices and linked cards use Copy’s original option numbers', async () => {
  const user = userEvent.setup()
  const value = port()
  value.input.copies = Array.from({ length: 5 }, (_, i) => ({ ...copy, id: `copy-${i + 1}`, headline: `Headline ${i + 1}`, approved: [1, 4].includes(i) }))
  value.input.directions = [{ id: 'd1', title: 'Linked idea', prompt: 'Prompt', scope: 'selected_copy', copy: value.input.copies[4], status: 'pending' }]
  render(<VisualsModule port={value} />)
  const card = screen.getByRole('article', { name: 'Linked idea' })
  expect(within(card).getByText('Linked copy · Option 5')).toBeInTheDocument()
  await user.click(screen.getAllByRole('button', { name: 'Upload visual' })[0])
  await user.click(screen.getByRole('button', { name: 'Copy for uploaded visual: Choose copy' }))
  expect(screen.getByRole('option', { name: 'Option 2 — Headline 2' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Option 5 — Headline 5' })).toBeInTheDocument()
})

test('upload failure appears beneath the affected static visual', async () => {
  const user = userEvent.setup()
  const value = port()
  value.actions.upload.mockResolvedValue({ ok: false, message: 'The image could not be saved.' })
  value.input.directions = [{ id: 'd1', title: 'Upload target', prompt: 'Prompt', scope: 'campaign', status: 'pending' }]
  render(<VisualsModule port={value} />)
  const card = screen.getByRole('article', { name: 'Upload target' })
  await user.click(within(card).getByRole('button', { name: 'Upload visual' }))
  await user.upload(screen.getByLabelText('Upload image file'), new File(['image'], 'image.png', { type: 'image/png' }))
  expect(within(card).getByRole('alert')).toHaveTextContent('The image could not be saved.')
})
