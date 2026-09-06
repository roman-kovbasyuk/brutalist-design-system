import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import BriefModule from './BriefModule.jsx'

it('keeps a draft when another part publishes a refreshed brief snapshot', () => {
  const port = { input: { brief: { notes: 'Original brief' }, analysis: null }, inputKey: 'first', access: { canEdit: true }, operation: { kind: 'idle' }, actions: { submit: vi.fn() }, setDirty: vi.fn() }
  const { rerender } = render(<BriefModule port={port} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My unsaved brief' } })
  rerender(<BriefModule port={{ ...port, inputKey: 'second', input: { ...port.input, brief: { notes: 'Server changed brief' } } }} />)
  expect(screen.getByRole('textbox')).toHaveValue('My unsaved brief')
  fireEvent.click(screen.getByRole('button', { name: /Analyze brief/ }))
  expect(port.actions.submit).toHaveBeenCalledWith(expect.objectContaining({ brief: { notes: 'My unsaved brief' } }), { expectedInputKey: 'first' })
})

const analyzedPort = () => ({ input: { brief: { notes: 'Original source' }, analysis: { title: 'Quiet launch', summary: 'A calm launch.', audience: 'Commuters', objective: 'Shop', channels: ['Instagram'], formats: ['1080 × 1080'], themes: [], warnings: [] } },
  inputKey: 'analyzed-source', access: { canEdit: true }, operation: { kind: 'idle' },
  actions: { save: vi.fn(async () => ({ ok: true })), refine: vi.fn(async () => ({ ok: true })), submit: vi.fn() }, setDirty: vi.fn() })

it('shows summary before facts and refinement; inline edits save the analyzed source', async () => {
  const port = analyzedPort()
  render(<BriefModule port={port} />)
  expect(screen.queryByRole('button', { name: /Analyze brief/ })).not.toBeInTheDocument()
  const summary = screen.getByRole('button', { name: 'Edit summary' })
  const audience = screen.getByRole('button', { name: 'Edit audience' })
  expect(summary.compareDocumentPosition(audience) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(audience)
  fireEvent.change(screen.getByRole('textbox', { name: 'Audience' }), { target: { value: 'Designers' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Audience' }), { key: 'Enter' })
  await waitFor(() => expect(port.actions.save).toHaveBeenCalledWith({ brief: { notes: 'Original source', analysis: { ...port.input.analysis, audience: 'Designers' } } }, { expectedInputKey: 'analyzed-source' }))
})

it('preserves refinement input on failure and submits it with the captured source', async () => {
  const port = analyzedPort()
  port.actions.refine.mockResolvedValue({ ok: false, code: 'source_changed', message: 'The source changed.' })
  render(<BriefModule port={port} />)
  const chat = screen.getByRole('textbox', { name: 'Refine brief' })
  fireEvent.change(chat, { target: { value: 'Make the audience designers' } })
  fireEvent.click(screen.getByRole('button', { name: /Update brief/ }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The source changed.'))
  expect(chat).toHaveValue('Make the audience designers')
  expect(port.actions.refine).toHaveBeenCalledWith('Make the audience designers', { expectedInputKey: 'analyzed-source' })
})

it('keeps a local raw draft when another editor publishes analysis', () => {
  const port = analyzedPort()
  const { rerender } = render(<BriefModule port={{ ...port, input: { brief: port.input.brief, analysis: null } }} />)
  fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'My unsaved text' } })
  rerender(<BriefModule port={{ ...port, inputKey: 'remote-analysis' }} />)
  expect(screen.getByLabelText('Campaign description')).toHaveValue('My unsaved text')
})

it('keeps an inline draft when another editor invalidates analysis', () => {
  const port = analyzedPort()
  const { rerender } = render(<BriefModule port={port} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit summary' }))
  fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'My unsaved summary' } })
  rerender(<BriefModule port={{ ...port, inputKey: 'remote-raw', input: { brief: { notes: 'Changed' }, analysis: null } }} />)
  expect(screen.getByLabelText('Summary')).toHaveValue('My unsaved summary')
})

it('lets an invalidated refinement draft be cleared without submitting stale input', () => {
  const port = analyzedPort()
  const { rerender } = render(<BriefModule port={port} />)
  fireEvent.change(screen.getByLabelText('Refine brief'), { target: { value: 'Keep my draft' } })
  rerender(<BriefModule port={{ ...port, inputKey: 'remote-raw', input: { brief: { notes: 'Changed' }, analysis: null } }} />)
  expect(screen.getByLabelText('Refine brief')).toBeEnabled()
  expect(screen.getByRole('button', { name: /Update brief/ })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Refine brief'), { target: { value: '' } })
  expect(screen.getByLabelText('Campaign description')).toHaveValue('Changed')
})

it('keeps the composer disabled for the entire analysis and copy sequence', async () => {
  let finish
  const port = { input: { brief: { notes: 'A campaign' }, analysis: null }, inputKey: 'source', access: { canEdit: true }, operation: { kind: 'idle' }, actions: { submit: vi.fn(() => new Promise(resolve => { finish = resolve })) }, setDirty: vi.fn() }
  const { rerender } = render(<BriefModule port={port} />)
  fireEvent.click(screen.getByRole('button', { name: /Analyze brief/ }))
  rerender(<BriefModule port={{ ...port, operation: { kind: 'idle' } }} />)
  expect(screen.getByRole('textbox')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
  await act(async () => finish({ ok: true }))
  expect(screen.getByRole('textbox')).toBeEnabled()
})
