import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { BriefStage } from './BriefStage.jsx'

describe('brief composer', () => {
  test('creates a campaign from one description without additional fields', async () => {
    const onSave = vi.fn(async () => {})
    render(<BriefStage onSave={onSave} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Autumn headphones launch. For commuters, 20% off until October 1.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate five options' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: 'Autumn headphones launch', brief: { notes: 'Autumn headphones launch. For commuters, 20% off until October 1.' } }))
  })
  test('allows a file-only brief and passes extracted text to campaign creation', async () => {
    const onSave = vi.fn(async () => {})
    const api = { extractBriefFile: vi.fn(async () => ({ text: 'Promote the autumn collection. Save 20% this weekend.' })) }
    render(<BriefStage onSave={onSave} api={api} />)
    fireEvent.change(screen.getByLabelText('Brief files'), { target: { files: [new File(['Promote the autumn collection.'], 'campaign.txt', { type: 'text/plain' })] } })
    await screen.findByRole('button', { name: 'Remove campaign.txt' })
    fireEvent.click(screen.getByRole('button', { name: 'Generate five options' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brief: { notes: expect.stringContaining('Save 20% this weekend.') } })))
    expect(api.extractBriefFile).toHaveBeenCalledWith({ name: 'campaign.txt', mimeType: 'text/plain', data: expect.any(String) })
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
    expect(screen.queryByRole('button', { name: 'Generate five options' })).not.toBeInTheDocument()
  })
})
