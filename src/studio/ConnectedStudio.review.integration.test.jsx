import { createHash } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createIsolatedStudio } from '../../server/testing/isolatedStudio.js'
import { createStudioApi } from './api.js'
import { ConnectedStudio } from './StudioApp.jsx'
import { createCampaignRuntime } from './campaign/campaignRuntime.js'
import { createWorkflowCoordinator } from './campaign/workflowCoordinator.js'

const openStudios = new Set()
const rendered = new Set()
const browserPlumbingProperties = [
  [Element.prototype, 'scrollIntoView'],
  [window, 'matchMedia'],
  [URL, 'createObjectURL'],
  [URL, 'revokeObjectURL'],
]
const originalBrowserPlumbing = browserPlumbingProperties.map(([target, property]) =>
  [target, property, Object.getOwnPropertyDescriptor(target, property)])

function restoreBrowserPlumbing() {
  for (const [target, property, descriptor] of originalBrowserPlumbing) {
    if (descriptor) Object.defineProperty(target, property, descriptor)
    else delete target[property]
  }
}

afterEach(async () => {
  for (const view of rendered) view.unmount()
  rendered.clear()
  vi.restoreAllMocks()
  restoreBrowserPlumbing()
  const results = await Promise.allSettled([...openStudios].map(studio => studio.close()))
  openStudios.clear()
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
})

const brief = {
  product: 'Quiet wireless headphones', audience: 'City commuters', objective: 'Shop the autumn launch',
  offer: '20% off until Sunday', locale: 'en', notes: 'Calm editorial campaign for Instagram.',
}

const ok = result => expect(result).toEqual({ ok: true })
const workspace = runtime => runtime.read(({ workspace: value }) => value)
const blobBytes = blob => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(Buffer.from(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsArrayBuffer(blob)
})

function observedApi(studio, role, requests) {
  return createStudioApi({
    baseUrl: studio.url,
    getHeaders: () => ({ 'X-Test-Studio-Role': role }),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? 'GET' })
      return globalThis.fetch(url, init)
    },
  })
}

async function connect(studio, campaignId, role = 'marketer') {
  const api = studio.api(role)
  const templates = (await api.listTemplates()).templates
  const runtime = createCampaignRuntime({ api, actor: studio.actor(role), templates,
    workspace: await api.getWorkspace(campaignId) })
  const coordinator = createWorkflowCoordinator({ runtime })
  if (runtime.getSnapshot('review').input.version) await runtime.refresh({ review: true })
  return { api, templates, runtime, actions: coordinator.actions, coordinator }
}

async function seedReview() {
  const studio = await createIsolatedStudio()
  openStudios.add(studio)
  const api = studio.api('marketer')
  const campaign = await api.createCampaign({ title: 'Connected review regression', brief })
  const session = await connect(studio, campaign.id)
  ok(await session.coordinator.analyzeAndGenerate())
  let state = await workspace(session.runtime)
  const copy = state.copies[0].candidates.reduce((shortest, item) =>
    item.headline.length < shortest.headline.length ? item : shortest)
  ok(await session.actions.copy.approve(copy.id))
  ok(await session.actions.visuals.generate('selected_copy'))
  state = await workspace(session.runtime)
  const direction = state.directions.find(item => item.copy?.id === copy.id && item.status === 'ready')
  ok(await session.actions.visuals.select(direction.id))
  state = await workspace(session.runtime)
  const template = session.templates.find(item => item.id === 'product-spotlight')
  const design = { templateId: template.id, templateVersion: template.version,
    copySetId: state.copies[0].id, copyId: copy.id, directionId: direction.id }
  const saved = await session.actions.banners.saveBatch({ designs: [design], ratioIds: ['square'] })
  expect(saved).toEqual({ ok: true, reviewInputKey: expect.any(String) })
  ok(await session.actions.banners.prepareReview({ expectedInputKey: saved.reviewInputKey }))
  state = await workspace(session.runtime)
  const v1 = structuredClone(state.versions.find(item => item.versionNumber === 1))
  const v1Revision = state.campaign.revision
  session.runtime.dispose()
  return { studio, campaignId: campaign.id, design, v1, v1Revision }
}

function mount(studio, campaignId, role, requests, module = 'review') {
  history.replaceState({}, '', `/mvp/campaign/${encodeURIComponent(campaignId)}?module=${module}#campaign-module-${module}`)
  const view = render(<ConnectedStudio api={observedApi(studio, role, requests)} />)
  rendered.add(view)
  return () => { view.unmount(); rendered.delete(view) }
}

async function requestChangesFromDesigner(studio, campaignId, requests, comment) {
  const user = userEvent.setup()
  const unmount = mount(studio, campaignId, 'designer', requests)
  expect(await screen.findByText('Version 1')).toBeVisible()
  const review = within(await screen.findByRole('region', { name: 'Review module' }))
  await user.type(await review.findByRole('textbox', { name: 'Request a change' }), comment)
  await user.click(review.getByRole('button', { name: 'Request changes' }))
  await screen.findByRole('heading', { level: 3, name: 'Changes requested' })
  unmount()
}

function installBrowserPlumbing(downloads) {
  // jsdom has no layout engine or object-URL backed downloads. These substitutes stop at that browser boundary.
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true })) })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(blob => {
    downloads.blobs.push(blob)
    return `blob:connected-review-${downloads.blobs.length}`
  }) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloads.clicks.push({ href: this.href, filename: this.download })
  })
}

describe('ConnectedStudio review flow through real HTTP and isolated services', () => {
  test('browser plumbing cleanup restores the exact original global property descriptors', () => {
    const before = browserPlumbingProperties.map(([target, property]) =>
      Object.getOwnPropertyDescriptor(target, property))
    installBrowserPlumbing({ blobs: [], clicks: [] })
    expect(browserPlumbingProperties.map(([target, property]) =>
      Object.getOwnPropertyDescriptor(target, property))).not.toEqual(before)

    vi.restoreAllMocks()
    restoreBrowserPlumbing()
    expect(browserPlumbingProperties.map(([target, property]) =>
      Object.getOwnPropertyDescriptor(target, property))).toEqual(before)
  })

  test('designer changes lead to one pointer-activated reopen, then v2 approval and ZIP download while v1 stays immutable', async () => {
    const requests = [], downloads = { blobs: [], clicks: [] }
    installBrowserPlumbing(downloads)
    const { studio, campaignId, design, v1, v1Revision } = await seedReview()
    await requestChangesFromDesigner(studio, campaignId, requests, 'Use the portrait layout for round two')

    const user = userEvent.setup()
    let unmount = mount(studio, campaignId, 'marketer', requests)
    expect(location.search).toBe('?module=review')
    expect(await screen.findByText('Version 1')).toBeVisible()
    const reopen = await screen.findByRole('button', { name: 'Reopen to edit' })
    expect(reopen).toBeEnabled()
    await user.click(reopen)
    await screen.findByRole('button', { name: 'Create version and send to review' })
    expect(requests.filter(item => item.method === 'POST' && new URL(item.url).pathname.endsWith('/reopen'))).toHaveLength(1)
    let persisted = await studio.api('marketer').getWorkspace(campaignId)
    expect(persisted.campaign).toMatchObject({ status: 'composed', revision: v1Revision + 2 })
    expect(persisted.campaign.openVersionId).toBeNull()
    unmount()

    const marketer = await connect(studio, campaignId)
    const saved = await marketer.actions.banners.saveBatch({ designs: [design], ratioIds: ['portrait'] })
    expect(saved).toEqual({ ok: true, reviewInputKey: expect.any(String) })
    ok(await marketer.actions.banners.prepareReview({ expectedInputKey: saved.reviewInputKey }))
    persisted = await workspace(marketer.runtime)
    const v2 = persisted.versions.find(item => item.versionNumber === 2)
    expect(v2.versionNumber).toBe(2)
    marketer.runtime.dispose()

    unmount = mount(studio, campaignId, 'designer', requests)
    expect(await screen.findByText('Version 2')).toBeVisible()
    const review = within(await screen.findByRole('region', { name: 'Review module' }))
    await user.type(await review.findByRole('textbox', { name: 'Figma review link' }), 'https://www.figma.com/design/connected/v2')
    for (const checkbox of review.getAllByRole('checkbox')) await user.click(checkbox)
    await user.click(review.getByRole('button', { name: 'Mark ready for approval' }))
    await review.findByRole('heading', { level: 3, name: 'Ready for approval' })
    unmount()

    unmount = mount(studio, campaignId, 'marketer', requests)
    const approve = await screen.findByRole('button', { name: 'Approve version 2' })
    await user.click(approve)
    await screen.findByText('Approved and ready to export')
    await user.click(screen.getByRole('button', { name: 'Build delivery' }))
    const download = await screen.findByRole('button', { name: 'Download package' })
    await waitFor(() => expect(download).toBeEnabled())
    await user.click(download)
    await waitFor(() => expect(downloads.clicks).toContainEqual(expect.objectContaining({ filename: 'banner-studio-v2.zip' })))

    persisted = await studio.api('marketer').getWorkspace(campaignId)
    expect(persisted.delivery.versionId).toBe(v2.id)
    const zip = downloads.blobs.find(blob => blob.type === 'application/zip')
    expect(zip).toBeInstanceOf(Blob)
    const bytes = await blobBytes(zip)
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(persisted.delivery.asset.sha256)
    const currentV1 = (await studio.pool.query('SELECT snapshot, content_hash FROM campaign_versions WHERE id=$1', [v1.id])).rows[0]
    expect(currentV1).toEqual({ snapshot: v1.snapshot, content_hash: v1.contentHash })
    expect((await studio.api('marketer').getReview(v1.id)).events.map(item => item.eventType))
      .toEqual(['sent', 'changes_requested'])
    unmount()
  }, 60_000)

  test('keyboard activation reopens a fresh changes-requested review exactly once', async () => {
    const requests = [], downloads = { blobs: [], clicks: [] }
    installBrowserPlumbing(downloads)
    const { studio, campaignId, v1Revision } = await seedReview()
    await requestChangesFromDesigner(studio, campaignId, requests, 'Increase the breathing room')

    const user = userEvent.setup()
    mount(studio, campaignId, 'marketer', requests)
    expect(location.search).toBe('?module=review')
    expect(await screen.findByText('Version 1')).toBeVisible()
    const reopen = await screen.findByRole('button', { name: 'Reopen to edit' })
    expect(reopen).toBeEnabled()
    reopen.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Create version and send to review' })
    expect(requests.filter(item => item.method === 'POST' && new URL(item.url).pathname.endsWith('/reopen'))).toHaveLength(1)
    const persisted = await studio.api('marketer').getWorkspace(campaignId)
    expect(persisted.campaign).toMatchObject({ status: 'composed', revision: v1Revision + 2 })
    expect(persisted.campaign.openVersionId).toBeNull()
  }, 45_000)
})
