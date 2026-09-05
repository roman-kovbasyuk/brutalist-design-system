import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { BriefStage } from './BriefStage.jsx'

describe('brief composer', () => {
  test('creates a campaign from one description without additional fields', async () => {
    const onSave = vi.fn(async () => {})
    render(<BriefStage onSave={onSave} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Autumn headphones launch. For commuters, 20% off until October 1.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: 'Autumn headphones launch', brief: { notes: 'Autumn headphones launch. For commuters, 20% off until October 1.' } }))
  })
  test('allows a file-only brief and passes extracted text to campaign creation', async () => {
    const onSave = vi.fn(async () => {})
    const api = { extractBriefFile: vi.fn(async () => ({ text: 'Promote the autumn collection. Save 20% this weekend.' })) }
    render(<BriefStage onSave={onSave} api={api} />)
    fireEvent.change(screen.getByLabelText('Brief files'), { target: { files: [new File(['Promote the autumn collection.'], 'campaign.txt', { type: 'text/plain' })] } })
    await screen.findByRole('button', { name: 'Remove campaign.txt' })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brief: { notes: expect.stringContaining('Save 20% this weekend.') } })))
    expect(api.extractBriefFile).toHaveBeenCalledWith({ name: 'campaign.txt', mimeType: 'text/plain', data: expect.any(String) })
  })
  test.each([
    ['campaign.md', '', 'text/markdown'],
    ['campaign.md', 'application/octet-stream', 'text/markdown'],
    ['campaign.markdown', '', 'text/markdown'],
  ])('normalizes browser MIME %p for file-only %s briefs', async (name, browserType, expectedType) => {
    const onSave = vi.fn(async () => {})
    const api = { extractBriefFile: vi.fn(async () => ({ text: 'Campaign launch notes' })) }
    render(<BriefStage onSave={onSave} api={api} />)
    fireEvent.change(screen.getByLabelText('Brief files'), {
      target: { files: [new File(['Campaign launch notes'], name, { type: browserType })] },
    })
    await screen.findByRole('button', { name: `Remove ${name}` })
    expect(api.extractBriefFile).toHaveBeenCalledWith({ name, mimeType: expectedType, data: expect.any(String) })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brief: { notes: expect.stringContaining('Campaign launch notes') } })))
  })
  test('preserves contradictory browser MIME for server-side rejection', async () => {
    const api = { extractBriefFile: vi.fn(async () => { throw new Error('Unsupported attachment') }) }
    render(<BriefStage onSave={vi.fn()} api={api} />)
    fireEvent.change(screen.getByLabelText('Brief files'), {
      target: { files: [new File(['Campaign'], 'campaign.md', { type: 'application/pdf' })] },
    })
    await screen.findByRole('alert')
    expect(api.extractBriefFile).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'application/pdf' }))
  })
  test('preserves an over-limit paste so the user can edit it while blocking submission', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => {})
    render(<BriefStage onSave={onSave} />)
    const composer = screen.getByLabelText('Campaign description')
    const pasted = 'x'.repeat(20_001)
    await user.click(composer)
    await user.paste(pasted)
    expect(composer).toHaveValue(pasted)
    expect(screen.getByRole('alert')).toHaveTextContent('exceeds 20,000 characters')
    expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })
  test('preserves typed input and explains extraction failure', async () => {
    const api = { extractBriefFile: vi.fn(async () => { throw new Error('This PDF has no readable text. Paste the brief instead.') }) }
    render(<BriefStage onSave={vi.fn()} api={api} />)
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Keep this draft' } })
    fireEvent.change(screen.getByLabelText('Brief files'), { target: { files: [new File(['pdf'], 'scan.pdf', { type: 'application/pdf' })] } })
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('Paste the brief instead')
    expect(screen.getByLabelText('Campaign description')).toHaveValue('Keep this draft')
    expect(screen.queryByRole('button', { name: 'Remove scan.pdf' })).not.toBeInTheDocument()
  })
  test('keeps structured legacy context readable while hiding configuration fields', () => {
    render(<BriefStage campaign={{ id: 'old', revision: 1, title: 'Launch', brief: { product: 'Headphones', audience: 'Commuters', objective: 'Try the collection', offer: '20% off', locale: 'fr', notes: 'Keep it simple.' } }} readOnly />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByLabelText('Campaign description')).toBeDisabled()
    expect(screen.getByLabelText('Campaign description').value).toContain('Headphones')
    expect(screen.getByLabelText('Campaign description').value).toContain('Keep it simple.')
    expect(screen.queryByRole('button', { name: 'Analyze brief' })).not.toBeInTheDocument()
  })
})
