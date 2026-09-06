import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ModuleHost } from './ModuleHost.jsx'
import { createCampaignRuntime } from './campaignRuntime.js'
import { makeScenario } from './testing/workspaceFixtures.js'

function visualsRuntime(operation, mutate = () => {}) {
  const scenario = makeScenario('visuals-ready')
  mutate(scenario.workspace)
  const runtime = createCampaignRuntime({ ...scenario, api: { getAssetBlob: vi.fn(async () => new Blob(['image'], { type: 'image/png' })) } })
  const base = runtime.getSnapshot('visuals')
  const snapshot = { ...base, operation }
  return { ...runtime, getSnapshot: id => id === 'visuals' ? snapshot : runtime.getSnapshot(id), subscribe: () => () => {} }
}

test('real Visuals content and its host announce one targeted image error', async () => {
  const runtime = visualsRuntime(
    { kind: 'failed', actionId: 'image:direction-1', error: { message: 'The image provider timed out.' } },
    workspace => { workspace.directions[0].previewAssetId = null },
  )
  render(<ModuleHost runtime={runtime} moduleId="visuals" />)
  const card = await screen.findByRole('article', { name: 'Soft daylight' })
  expect(within(card).getByRole('alert')).toHaveTextContent('The image provider timed out.')
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Check latest state' })).toBeVisible()
})

test('real Visuals content owns an upload failure without a host duplicate', async () => {
  const error = { ok: false, message: 'The image could not be saved.' }
  const runtime = visualsRuntime({ kind: 'failed', actionId: 'upload:campaign', error })
  const user = userEvent.setup()
  render(<ModuleHost runtime={runtime} moduleId="visuals" actions={{ upload: vi.fn(async () => error) }} />)
  const campaignMethod = (await screen.findByRole('heading', { name: 'Campaign-wide visuals' })).closest('article')
  await user.click(within(campaignMethod).getByRole('button', { name: 'Upload visual' }))
  await user.upload(screen.getByLabelText('Upload image file'), new File(['image'], 'image.png', { type: 'image/png' }))
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent('The image could not be saved.')
})

test.each([
  ['returned', vi.fn(async () => ({ ok: false, message: 'Immediate upload failed.' }))],
  ['thrown', vi.fn(async () => { throw new Error('Immediate upload failed.') })],
])('real Visuals content owns an immediate idle %s upload error', async (_kind, upload) => {
  const runtime = visualsRuntime({ kind: 'idle', actionId: null, error: null })
  const user = userEvent.setup()
  render(<ModuleHost runtime={runtime} moduleId="visuals" actions={{ upload }} />)
  const campaignMethod = (await screen.findByRole('heading', { name: 'Campaign-wide visuals' })).closest('article')
  await user.click(within(campaignMethod).getByRole('button', { name: 'Upload visual' }))
  await user.upload(screen.getByLabelText('Upload image file'), new File(['image'], 'image.png', { type: 'image/png' }))
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent('Immediate upload failed.')
  expect(screen.getAllByRole('button', { name: 'Check latest state' })).toHaveLength(1)
})

test('real Visuals content owns non-local select errors without a host duplicate', async () => {
  const runtime = visualsRuntime({ kind: 'failed', actionId: 'select', error: { message: 'Selection could not be saved.' } })
  render(<ModuleHost runtime={runtime} moduleId="visuals" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Selection could not be saved.')
  expect(screen.getAllByRole('alert')).toHaveLength(1)
})
