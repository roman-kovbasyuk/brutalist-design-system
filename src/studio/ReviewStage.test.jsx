import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReviewStage } from './ReviewStage.jsx'

function fixture({ status = 'in_review', role = 'marketer', stage = 5 } = {}) {
  const version = { id: 'version-2', versionNumber: 2, createdAt: '2026-09-05T08:00:00Z', snapshot: { assets: [] } }
  const workspace = { campaign: { id: 'campaign-1', title: 'Autumn campaign', status, currentVersionNumber: 2, revision: 8 }, versions: [version, { ...version, id: 'version-1', versionNumber: 1 }], composition: { ratioIds: ['square'], validation: { valid: true } }, delivery: null }
  const api = { getReview: vi.fn(async () => ({ version, status, events: [] })), getAssetBlob: vi.fn() }
  const callbacks = { onVersion: vi.fn(), onReview: vi.fn(), onDeliver: vi.fn(), onReopen: vi.fn() }
  return { workspace, api, callbacks, props: { stage, workspace, api, actor: { id: `${role}-1`, role }, pending: '', ...callbacks } }
}

describe('version review integration', () => {
  test('loads the persisted current version from a descending history', async () => {
    const { props, api } = fixture()
    render(<ReviewStage {...props} />)
    expect(screen.getByText('Version 2')).toBeInTheDocument()
    expect(screen.queryByText('Version 1')).not.toBeInTheDocument()
    await waitFor(() => expect(api.getReview).toHaveBeenCalledWith('version-2'))
  })
  test('requires all designer checks and forwards the exact ready contract', async () => {
    const { props, callbacks } = fixture({ role: 'designer' })
    render(<ReviewStage {...props} />)
    const ready = screen.getByRole('button', { name: 'Mark ready for approval' })
    expect(ready).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Figma review link'), { target: { value: 'https://www.figma.com/design/review/banner' } })
    const checks = screen.getAllByRole('checkbox')
    fireEvent.click(checks[0]); fireEvent.click(checks[1])
    expect(ready).toBeDisabled()
    fireEvent.click(checks[2])
    expect(ready).toBeEnabled()
    fireEvent.click(ready)
    expect(callbacks.onReview).toHaveBeenCalledWith('mark-ready', { figmaUrl: 'https://www.figma.com/design/review/banner', checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true } })
    await screen.findByText('Version activity')
  })
  test('marketer waits for designer and cannot mark their own version ready', async () => {
    const { props } = fixture()
    render(<ReviewStage {...props} />)
    expect(screen.queryByRole('button', { name: 'Mark ready for approval' })).not.toBeInTheDocument()
    expect(screen.getByText(/Waiting for the designer/)).toBeInTheDocument()
    await screen.findByText('Version activity')
  })
  test('changes-requested review can be reopened by marketer, not designer', async () => {
    const { props, callbacks } = fixture({ status: 'changes_requested' })
    const view = render(<ReviewStage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen to edit' }))
    expect(callbacks.onReopen).toHaveBeenCalledOnce()
    view.rerender(<ReviewStage {...props} actor={{ id: 'designer-1', role: 'designer' }} />)
    expect(screen.queryByRole('button', { name: 'Reopen to edit' })).not.toBeInTheDocument()
    await screen.findByText('Version activity')
  })
  test.each(['approved', 'delivered'])('does not offer unsupported reopen from %s', async status => {
    const { props } = fixture({ status, stage: 7 })
    render(<ReviewStage {...props} />)
    expect(screen.queryByRole('button', { name: /Reopen|Start a new round/i })).not.toBeInTheDocument()
    await screen.findByText('Version activity')
  })
  test('does not offer self-approval when ready actor matches current marketer', async () => {
    const { props, api } = fixture({ status: 'ready', stage: 6 })
    api.getReview.mockResolvedValue({ events: [{ id: 'ready-1', eventType: 'ready', actorId: 'marketer-1', actorRole: 'designer', createdAt: '2026-09-05T08:00:00Z', payload: { figmaUrl: 'https://www.figma.com/design/example' } }] })
    render(<ReviewStage {...props} />)
    await screen.findByText('Designer checks completed')
    expect(screen.queryByRole('button', { name: /Approve version/ })).not.toBeInTheDocument()
  })
  test.each(['in_review', 'changes_requested', 'approved', 'delivered'])('cannot create another review version by revisiting the file step while %s', async status => {
    const { props } = fixture({ status, stage: 4 })
    render(<ReviewStage {...props} />)
    const create = screen.queryByRole('button', { name: 'Create version and send to review' })
    if (create) expect(create).toBeDisabled()
    await waitFor(() => expect(props.api.getReview).toHaveBeenCalledWith('version-2'))
  })
})
