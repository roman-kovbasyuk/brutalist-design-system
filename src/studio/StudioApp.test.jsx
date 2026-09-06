import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConnectedStudio } from './StudioApp.jsx'
import { makeScenario } from './campaign/testing/workspaceFixtures.js'

vi.mock('./auth.js', () => ({ useStudioAuth: vi.fn() }))
vi.mock('./AnimatedBanner.jsx', () => ({ AnimatedBanner: () => <div aria-label="Banner preview" /> }))

const brief = { product: 'Studio', audience: 'Designers', objective: 'Trial', offer: '', locale: 'en', notes: '' }
function fixture({ role = 'marketer', status = 'draft' } = {}) {
  const scenario = makeScenario(status.replaceAll('_', '-'))
  const workspace = scenario.workspace
  const campaign = workspace.campaign
  Object.assign(campaign, { title: 'Autumn launch', brief, revision: 8 })
  const version = workspace.versions[0]
  if (version) {
    version.id = 'version-2'; version.versionNumber = 2
    campaign.currentVersionNumber = 2
    if (campaign.openVersionId) campaign.openVersionId = version.id
    scenario.reviewHistory.events.forEach(event => { event.versionId = version.id })
    workspace.versions.push({ ...version, id: 'version-1', versionNumber: 1 })
  }
  const api = {
    getSession: vi.fn(async () => ({ id: `${role}-1`, role, displayName: 'Roman', email: 'roman@example.com' })),
    listCampaigns: vi.fn(async () => ({ campaigns: [campaign] })),
    listTemplates: vi.fn(async () => ({ templates: scenario.templates })),
    getWorkspace: vi.fn(async () => workspace),
    getReview: vi.fn(async () => scenario.reviewHistory),
    getAssetBlob: vi.fn(async () => new Blob([], { type: 'image/png' })),
    createCampaign: vi.fn(async () => campaign), patchCampaign: vi.fn(async () => campaign),
    duplicateCampaign: vi.fn(async () => ({ ...campaign, id: 'campaign-2', title: 'Autumn launch copy', status: 'draft', revision: 0 })),
    deleteCampaign: vi.fn(async () => null),
    generate: vi.fn(async (id, step) => {
      if (step === 'brief') workspace.jobs = makeScenario('copy-ready').workspace.jobs
      return { job: { id: 'job-1', status: 'succeeded' } }
    }),
    reopen: vi.fn(async () => ({ campaign })),
    review: vi.fn(async () => ({ campaign, version })), request: vi.fn(async () => ({ campaign })),
  }
  return { api, workspace, campaign, version }
}
beforeEach(() => {
  history.replaceState({}, '', '/mvp')
  Element.prototype.scrollIntoView = vi.fn()
})

describe('connected studio workflow', () => {
  test('keeps module drafts through browser history and guards leaving the campaign', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?module=brief')
    const { api, workspace } = fixture()
    workspace.copies = makeScenario('copy-ready').workspace.copies
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ConnectedStudio api={api} />)
    const input = await screen.findByLabelText('Campaign description')
    fireEvent.change(input, { target: { value: 'Do not discard this draft' } })
    history.pushState({}, '', '/mvp/campaign/campaign-1?module=copy')
    fireEvent.popState(window)
    expect(screen.getByLabelText('Campaign description')).toBe(input)
    expect(confirm).not.toHaveBeenCalled()
    history.pushState({}, '', '/mvp/new')
    fireEvent.popState(window)
    expect(confirm).toHaveBeenCalledOnce()
    expect(location.pathname).toBe('/mvp/campaign/campaign-1')
    expect(input).toHaveValue('Do not discard this draft')
    confirm.mockRestore()
  })
  test('moves a project between pinned and recent groups and restores pins after remount', async () => {
    localStorage.removeItem('studio:pins:marketer-1')
    const { api } = fixture()
    const first = render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pin Autumn launch', exact: true }))
    expect(within(screen.getByRole('region', { name: 'Pinned projects' })).getByRole('link', { name: 'Autumn launch' })).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Recent projects' })).queryByRole('link', { name: 'Autumn launch' })).toBeNull()
    first.unmount()
    render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unpin Autumn launch', exact: true }))
    expect(within(screen.getByRole('region', { name: 'Recent projects' })).getByRole('link', { name: 'Autumn launch' })).toBeVisible()
    localStorage.removeItem('studio:pins:marketer-1')
  })
  test('opens banner brand styles from the design system menu', async () => {
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    fireEvent.click(screen.getByRole('link', { name: 'Design system', exact: true }))
    expect(await screen.findByRole('heading', { name: 'Brand design systems' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Editorial split' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Foundations' })).not.toBeInTheDocument()
    expect(location.pathname).toBe('/mvp/system')
  })
  test('keeps campaign status beside the name in the top bar', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1')
    const { api } = fixture({ status: 'in_review' })
    render(<ConnectedStudio api={api} />)
    const header = screen.getByRole('banner')
    await within(header).findByText('Autumn launch')
    expect(within(header).getByText('In design review')).toBeVisible()
  })
  test('renames an editable campaign title inline without rendering a form field', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1')
    const { api } = fixture()
    api.patchCampaign.mockResolvedValue({ ...api.getWorkspace.mock.results?.[0]?.value?.campaign, title: 'Winter launch' })
    render(<ConnectedStudio api={api} />)
    const title = await screen.findByRole('heading', { name: 'Autumn launch' })
    fireEvent.click(title)
    expect(title).toHaveAttribute('contenteditable', 'true')
    fireEvent.input(title, { target: { textContent: 'Winter launch' } })
    fireEvent.blur(title)
    await waitFor(() => expect(api.patchCampaign).toHaveBeenCalledWith('campaign-1', { title: 'Winter launch' }, 8))
    expect(screen.queryByRole('textbox', { name: /campaign title/i })).not.toBeInTheDocument()
  })
  test('keeps cards mounted while saving an approval', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=1')
    const { api, workspace } = fixture()
    let finishReload
    api.getWorkspace.mockResolvedValueOnce(workspace).mockImplementationOnce(() => new Promise(resolve => { finishReload = () => resolve(workspace) }))
    workspace.copies = [{ id: 's1', stale: false, selectedCandidateId: null, candidates: [{ id: 'c1', headline: 'Listen your way', body: 'A quieter commute.', cta: 'Shop now', offer: '' }] }]
    api.approveCopy = vi.fn(async () => { workspace.campaign.selectedCopyId = 's1'; workspace.copies[0].selectedCandidateId = 'c1'; workspace.copies[0].approvedCandidateIds = ['c1']; return workspace.campaign })
    render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve option 1' }))
    await waitFor(() => expect(finishReload).toBeTypeOf('function'))
    expect(screen.queryByRole('status', { name: 'Loading workspace' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Listen your way' })).toBeVisible()
    await act(async () => finishReload())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve option 1' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('tab', { name: 'Cards', exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve option 1' })).toBeDisabled()
  })
  test('does not save an inline title canceled with Escape', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1')
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    const title = await screen.findByRole('heading', { name: 'Autumn launch' })
    fireEvent.click(title)
    fireEvent.input(title, { target: { textContent: 'Canceled title' } })
    fireEvent.keyDown(title, { key: 'Escape' })
    fireEvent.blur(title)
    expect(api.patchCampaign).not.toHaveBeenCalled()
    expect(title).toHaveTextContent('Autumn launch')
  })
  test('boots the authenticated session and presents exactly three primary menu items', async () => {
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    const menu = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(menu).getAllByRole('link').map(link => link.textContent)).toEqual(['Campaigns', 'Templates', 'Design system'])
    expect(within(screen.getByRole('main').parentElement).queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(api.getSession).toHaveBeenCalledOnce()
    expect(api.listTemplates).toHaveBeenCalledOnce()
  })
  test('restores a campaign from its URL and prevents skipping unfinished steps', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=7')
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByLabelText('Campaign description')
    const workflow = screen.getByRole('list', { name: 'Campaign workflow' })
    const steps = within(workflow).getAllByRole('link')
    expect(steps).toHaveLength(6)
    expect(steps[0]).toHaveAttribute('aria-current', 'step')
    for (const step of steps.slice(1)) {
      expect(step).toHaveAttribute('aria-disabled', 'true')
      expect(fireEvent.click(step)).toBe(false)
    }
    expect(steps[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByLabelText('Campaign description')).toBeVisible()
    expect(api.getWorkspace).toHaveBeenCalledWith('campaign-1')
  })
  test('opens a saved campaign through conversation-like sidebar history', async () => {
    history.replaceState({}, '', '/mvp/new')
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    expect(within(screen.getByRole('main')).queryByRole('button', { name: /Autumn launch/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Autumn launch' }))
    await screen.findByLabelText('Campaign description')
    expect(location.pathname).toBe('/mvp/campaign/campaign-1')
    expect(screen.getByLabelText('Campaign description').value).toContain('Product: Studio')
  })
  test('provides campaign actions without chat icons and duplicates from the sidebar', async () => {
    history.replaceState({}, '', '/mvp')
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    expect(screen.queryByLabelText('Campaign icon')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Autumn launch' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => expect(api.duplicateCampaign).toHaveBeenCalledWith('campaign-1'))
    expect(location.pathname).toBe('/mvp/campaign/campaign-2')
  })
  test('deletes a campaign only after confirmation and sends its current revision', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Autumn launch' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteCampaign).toHaveBeenCalledWith('campaign-1', 8))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Autumn launch'))
    confirm.mockRestore()
  })
  test('opens sidebar search from the wordmark and filters campaigns', async () => {
    const { api } = fixture()
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    expect(screen.getAllByText('Studio')[0]).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Search campaigns' }))
    const input = screen.getByRole('searchbox', { name: 'Search campaigns' })
    fireEvent.change(input, { target: { value: 'autumn' } })
    expect(screen.getByRole('link', { name: 'Autumn launch' })).toBeVisible()
  })
  test('designer can inspect campaign brief but cannot edit or create campaigns', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api } = fixture({ role: 'designer', status: 'in_review' })
    render(<ConnectedStudio api={api} />)
    await screen.findByLabelText('Analyzed brief')
    expect(screen.queryByRole('button', { name: 'Edit summary' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Refine brief')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save brief' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve option 1' })).toBeDisabled()
  })
  test('retains a new campaign form when the server rejects creation', async () => {
    const { api } = fixture()
    api.createCampaign.mockRejectedValue(Object.assign(new Error('Campaign could not be saved'), { status: 422 }))
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'My new campaign for design teams. Start a trial.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await screen.findAllByText('Campaign could not be saved')
    expect(screen.getByLabelText('Campaign description')).toHaveValue('My new campaign for design teams. Start a trial.')
    expect(location.pathname).toBe('/mvp')
    expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeEnabled()
  })
  test('retains unsaved edits after a stale revision save error', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api } = fixture()
    api.patchCampaign.mockRejectedValue(Object.assign(new Error('Reload before saving'), { status: 409 }))
    render(<ConnectedStudio api={api} />)
    await screen.findByLabelText('Campaign description')
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Edited campaign brief' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await screen.findByText('Reload before saving')
    expect(api.patchCampaign).toHaveBeenCalledWith('campaign-1', { brief: { notes: 'Edited campaign brief' } }, 8)
    expect(screen.getByLabelText('Campaign description')).toHaveValue('Edited campaign brief')
    expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeEnabled()
    expect(api.generate).not.toHaveBeenCalled()
  })
  test('approves the current persisted version, not the oldest version', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=6')
    const { api } = fixture({ status: 'ready' })
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
    await waitFor(() => expect(api.reopen).toHaveBeenCalledWith('campaign-1', 8, expect.any(String)))
    await waitFor(() => expect(api.getWorkspace).toHaveBeenCalledTimes(2))
  })
  test('unknown generation does not advance the campaign or automatically retry', async () => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api } = fixture()
    api.generate.mockResolvedValue({ job: { id: 'job-unknown', status: 'unknown' } })
    render(<ConnectedStudio api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Analyze brief' }))
    await screen.findAllByText(/Generation unknown/i)
    expect(api.generate).toHaveBeenCalledTimes(1)
    expect(api.generate.mock.calls[0][1]).toBe('brief')
    expect(location.search).toBe('?step=0')
  })
  test.each(['pending', 'unknown'])('blocks another generation attempt while a persisted job is %s', async status => {
    history.replaceState({}, '', '/mvp/campaign/campaign-1?step=0')
    const { api, workspace } = fixture()
    workspace.jobs = [{ id: 'unresolved-job', status, step: 'copy' }]
    render(<ConnectedStudio api={api} />)
    await screen.findByLabelText('Campaign description')
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
    await screen.findAllByText(/Generation unknown/i)
    expect(api.generate).toHaveBeenCalledTimes(2)
    expect(api.generate.mock.calls[0][3]).toBe(api.generate.mock.calls[1][3])
    expect(api.generate.mock.calls[0][3]).toEqual(expect.any(String))
  })
  test('saves a freeform campaign then generates its analysis and copy without another click', async () => {
    const { api, workspace } = fixture()
    api.generate.mockImplementation(async (id, step) => {
      if (step === 'brief') workspace.jobs = makeScenario('copy-ready').workspace.jobs
      if (step === 'copy') { workspace.campaign.status = 'copy_ready'; workspace.copies = [{ id: 'new-set', stale: false, selectedCandidateId: null, candidates: [{ id: 'c1', headline: 'Autumn sound', body: 'Find your rhythm.', cta: 'Shop now', offer: '' }] }] }
      if (step === 'directions') workspace.jobs.push({ ...makeScenario('copy-ready').workspace.jobs[0], id: 'prompt-job', step: 'directions', result: { directions: [] } })
      return { job: { id: `job-${step}`, status: 'succeeded' } }
    })
    render(<ConnectedStudio api={api} />)
    await screen.findByRole('heading', { name: 'What are we creating?' })
    fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Autumn sound. Headphones for commuters.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))
    await screen.findByRole('button', { name: 'Approve option 1' })
    expect(api.createCampaign).toHaveBeenCalledWith({ title: 'Autumn sound', brief: { notes: 'Autumn sound. Headphones for commuters.' } })
    expect(api.generate.mock.calls.map(call => call.slice(0, 2))).toEqual([['campaign-1', 'brief'], ['campaign-1', 'copy'], ['campaign-1', 'directions']])
    expect(location.search).toBe('?module=brief')
    fireEvent.click(screen.getByRole('link', { name: 'Templates', exact: true }))
    await screen.findByRole('heading', { name: 'A starting point for every idea' })
    fireEvent.click(screen.getByRole('link', { name: 'Autumn launch' }))
    await screen.findByRole('button', { name: 'Preview option 1' })
    await act(async () => {})
    expect(api.generate).toHaveBeenCalledTimes(3)
  })
})
