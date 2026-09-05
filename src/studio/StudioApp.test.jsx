import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConnectedStudio } from './StudioApp.jsx'

vi.mock('./auth.js', () => ({ useStudioAuth: vi.fn() }))
vi.mock('./AnimatedBanner.jsx', () => ({ AnimatedBanner: () => <div aria-label="Banner preview" /> }))

const brief = { product: 'Studio', audience: 'Designers', objective: 'Trial', offer: '', locale: 'en', notes: '' }
function fixture({ role = 'marketer', status = 'draft' } = {}) {
  const campaign = { id: 'campaign-1', title: 'Autumn launch', brief, status, revision: 8, selectedCopyId: null, selectedDirectionId: null, compositionId: null, currentVersionNumber: 2, updatedAt: '2026-09-05T08:00:00Z' }
  const version = { id: 'version-2', versionNumber: 2, createdAt: '2026-09-05T08:00:00Z', snapshot: { assets: [] } }
  const workspace = { campaign, copies: [], directions: [], composition: null, versions: [version, { ...version, id: 'version-1', versionNumber: 1 }], jobs: [], delivery: null }
  const api = {
    getSession: vi.fn(async () => ({ id: `${role}-1`, role, displayName: 'Roman', email: 'roman@example.com' })),
    listCampaigns: vi.fn(async () => ({ campaigns: [campaign] })),
    listTemplates: vi.fn(async () => ({ templates: [] })),
    getWorkspace: vi.fn(async () => workspace),
    getReview: vi.fn(async () => ({ version, events: [], status })),
    createCampaign: vi.fn(async () => campaign), patchCampaign: vi.fn(async () => campaign),
    generate: vi.fn(async () => ({ job: { id: 'job-1', status: 'succeeded' } })),
    review: vi.fn(async () => ({ campaign, version })), request: vi.fn(async () => ({ campaign })),
  }
  return { api, workspace, campaign, version }
}
beforeEach(() => history.replaceState({}, '', '/mvp'))

describe('connected studio workflow', () => {
  test('keeps the comparison view after saving a copy selection', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=1')
    const { api, workspace } = fixture()
    let finishReload
    api.getWorkspace.mockResolvedValueOnce(workspace).mockImplementationOnce(() => new Promise(resolve => { finishReload = () => resolve(workspace) }))
    workspace.copies = [{ id: 's1', stale: false, selectedCandidateId: null, candidates: [{ id: 'c1', headline: 'Listen your way', body: 'A quieter commute.', cta: 'Shop now', offer: '' }] }]
    api.selectCopy = vi.fn(async () => { workspace.campaign.selectedCopyId = 's1'; workspace.copies[0].selectedCandidateId = 'c1'; return workspace.campaign })
    render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cards', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Select option 1' }))
    await screen.findByRole('status', { name: 'Loading workspace' })
    await act(async () => finishReload())
    await screen.findByText('Copy selected')
    expect(screen.getByRole('button', { name: 'Cards', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select option 1' })).toBeDisabled()
  })
  test('boots the authenticated session and presents exactly three primary menu items', async () => {
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    const menu = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(menu).getAllByRole('link').map(link => link.textContent)).toEqual(['Campaigns', 'Templates', 'Design system'])
    expect(api.getSession).toHaveBeenCalledOnce()
    expect(api.listTemplates).toHaveBeenCalledOnce()
  })
  test('restores a campaign from its URL and prevents skipping unfinished steps', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=7')
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'The campaign brief' })
    const workflow = screen.getByRole('navigation', { name: 'Campaign workflow' })
    const buttons = within(workflow).getAllByRole('button')
    expect(buttons).toHaveLength(8)
    expect(buttons[0]).toHaveAttribute('aria-current', 'step')
    for (const button of buttons.slice(1)) expect(button).toBeDisabled()
    expect(api.getWorkspace).toHaveBeenCalledWith('campaign-1')
  })
  test('opens a saved campaign through conversation-like sidebar history', async () => {
    history.replaceState({}, '', '/mvp/new')
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    expect(within(screen.getByRole('main')).queryByRole('button', { name: /Autumn launch/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Autumn launch' }))
    await screen.findByRole('heading', { name: 'The campaign brief' })
    expect(location.pathname).toBe('/mvp/campaign/campaign-1')
    expect(screen.getByLabelText('Campaign description').value).toContain('Product: Studio')
  })
  test('designer can inspect campaign brief but cannot edit or create campaigns', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api } = fixture({ role: 'designer', status: 'in_review' })
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'The campaign brief' })
    expect(screen.getByLabelText('Campaign description')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save brief' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate copy' })).not.toBeInTheDocument()
  })
  test('retains a new campaign form when the server rejects creation', async () => {
    const { api } = fixture()
    api.createCampaign.mockRejectedValue(new Error('Campaign could not be saved'))
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'My new campaign for design teams. Start a trial.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await screen.findByText('Campaign could not be saved')
    expect(screen.getByLabelText('Campaign description')).toHaveValue('My new campaign for design teams. Start a trial.')
    expect(location.pathname).toBe('/mvp')
    expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeEnabled()
  })
  test('retains unsaved edits after a stale revision save error', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api } = fixture()
    api.patchCampaign.mockRejectedValue(Object.assign(new Error('Reload before saving'), { status: 409 }))
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'The campaign brief' })
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Edited campaign brief' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await screen.findByText('Reload before saving')
    expect(api.patchCampaign).toHaveBeenCalledWith('campaign-1', { title: 'Autumn launch', brief: { notes: 'Edited campaign brief' } }, 8)
    expect(screen.getByLabelText('Campaign description')).toHaveValue('Edited campaign brief')
    expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeEnabled()
    expect(api.generate).not.toHaveBeenCalled()
  })
  test('approves the current persisted version, not the oldest version', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=6')
    const { api } = fixture({ status: 'ready' })
    api.getReview.mockResolvedValue({ events: [{ id: 'ready', eventType: 'ready', actorId: 'designer-1', actorRole: 'designer', createdAt: '2026-09-05T08:00:00Z', payload: { figmaUrl: 'https://www.figma.com/design/example' } }] })
    render(<ConnectedStudio api={api} />)
    const approve = await screen.findByRole('button', { name: 'Approve version 2' })
    await waitFor(() => expect(approve).toBeEnabled())
    fireEvent.click(approve)
    await waitFor(() => expect(api.review).toHaveBeenCalledWith('version-2', 'approve', {}, 8, expect.any(String)))
    await waitFor(() => expect(api.getWorkspace).toHaveBeenCalledTimes(2))
  })
  test('reopens a changes-requested campaign with revision and retry identity', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1')
    const { api } = fixture({ status: 'changes_requested' })
    render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen to edit' }))
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('POST', '/api/v1/campaigns/campaign-1/reopen', { body: {}, revision: 8, idempotencyKey: expect.any(String) }))
    await waitFor(() => expect(api.getWorkspace).toHaveBeenCalledTimes(2))
  })
  test('unknown generation does not advance the campaign or automatically retry', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api } = fixture()
    api.generate.mockResolvedValue({ job: { id: 'job-unknown', status: 'unknown' } })
    render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Analyze brief' }))
    await screen.findByText(/provider result is uncertain/i)
    expect(api.generate).toHaveBeenCalledTimes(1)
    expect(api.generate.mock.calls[0][1]).toBe('brief')
    expect(location.search).toBe('?step=0')
  })
  test.each(['pending', 'unknown'])('blocks another generation attempt while a persisted job is %s', async status => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api, workspace } = fixture()
    workspace.jobs = [{ id: 'unresolved-job', status, step: 'copy' }]
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'The campaign brief' })
    const generate = screen.queryByRole('button', { name: 'Analyze brief' })
    if (generate) {
      expect(generate).toBeDisabled()
      fireEvent.click(generate)
    }
    expect(api.generate).not.toHaveBeenCalled()
  })
  test('reuses the command identity after a transport error instead of making a duplicate paid request', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api } = fixture()
    api.generate.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ job: { id: 'job-unknown', status: 'unknown' } })
    render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Analyze brief' }))
    await screen.findByText('Connection lost')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await screen.findByText(/provider result is uncertain/i)
    expect(api.generate).toHaveBeenCalledTimes(2)
    expect(api.generate.mock.calls[0][3]).toBe(api.generate.mock.calls[1][3])
    expect(api.generate.mock.calls[0][3]).toEqual(expect.any(String))
  })
  test('saves a freeform campaign then generates its analysis and copy without another click', async () => {
    const { api, workspace } = fixture()
    api.generate.mockImplementation(async (id, step) => {
      if (step === 'copy') { workspace.campaign.status = 'copy_ready'; workspace.copies = [{ id: 'new-set', stale: false, selectedCandidateId: null, candidates: [{ id: 'c1', headline: 'Autumn sound', body: 'Find your rhythm.', cta: 'Shop now', offer: '' }] }] }
      return { job: { id: `job-${step}`, status: 'succeeded' } }
    })
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Autumn sound. Headphones for commuters.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await screen.findByRole('table', { name: 'Banner copy options' })
    expect(api.createCampaign).toHaveBeenCalledWith({ title: 'Autumn sound', brief: { notes: 'Autumn sound. Headphones for commuters.' } })
    expect(api.generate.mock.calls.map(call => call.slice(0, 2))).toEqual([['campaign-1', 'brief'], ['campaign-1', 'copy']])
    expect(location.search).toBe('?step=1')
  })
})
