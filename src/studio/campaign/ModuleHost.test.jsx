import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ModuleHost } from './ModuleHost.jsx'
import { makeScenario } from './testing/workspaceFixtures.js'
import { createCampaignRuntime } from './campaignRuntime.js'

vi.mock('./moduleRegistry.js', () => ({ moduleRegistry: {
  brief: () => { throw new Error('Broken Brief view') },
  copy: ({ port }) => <>{port.operation.error && <p role="alert">{port.operation.error.message}</p>}<p>Copy still works</p></>,
  visuals: ({ port }) => <>{port.operation.actionId === 'prepare-prompts' && port.operation.error && <p role="alert">{port.operation.error.message}</p>}</>,
  banners: () => null,
} }))

function runtimeFor(moduleId, operation) {
  const scenario = makeScenario(moduleId === 'banners' ? 'visuals-ready' : 'copy-ready')
  const runtime = createCampaignRuntime({ ...scenario, api: { getAssetBlob: vi.fn() } })
  const snapshot = runtime.getSnapshot(moduleId)
  const operationSnapshot = { ...snapshot, operation }
  return {
    ...runtime,
    getSnapshot: id => id === moduleId ? operationSnapshot : runtime.getSnapshot(id),
    subscribe: () => () => {},
  }
}

it('contains a render failure inside its own module frame', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const runtime = createCampaignRuntime({ ...makeScenario('copy-ready'), api: {} })
  render(<><ModuleHost runtime={runtime} moduleId="brief" /><ModuleHost runtime={runtime} moduleId="copy" /></>)
  expect(screen.getByRole('button', { name: 'Retry module' })).toBeVisible()
  expect(screen.getByText('Copy still works')).toBeVisible()
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)
  runtime.dispose(); log.mockRestore()
})

it('announces a failed Visuals prompt request once while preserving its retry owner', () => {
  const runtime = runtimeFor('visuals', { kind: 'failed', actionId: 'prepare-prompts', error: { message: 'Prompt request failed' } })
  render(<ModuleHost runtime={runtime} moduleId="visuals" />)
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent('Prompt request failed')
})

it('retains shared error feedback for modules without an operation error owner', () => {
  const runtime = runtimeFor('banners', { kind: 'failed', actionId: 'save', error: { message: 'Banner save failed' } })
  render(<ModuleHost runtime={runtime} moduleId="banners" />)
  expect(screen.getByRole('alert')).toHaveTextContent('Banner save failed')
})

it('does not duplicate Visuals-owned progress feedback', () => {
  const runtime = runtimeFor('visuals', { kind: 'running', actionId: 'generate', error: null })
  render(<ModuleHost runtime={runtime} moduleId="visuals" />)
  expect(screen.queryByText('Working on visuals…')).not.toBeInTheDocument()
})
