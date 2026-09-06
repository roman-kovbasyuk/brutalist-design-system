import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useCampaignRuntime } from './useCampaignRuntime.js'
import { makeScenario } from './testing/workspaceFixtures.js'

it('never returns a disposed scope when revisiting the same campaign', async () => {
  const scenario = makeScenario('draft')
  const props = { ...scenario, api: { getWorkspace: vi.fn(async () => scenario.workspace) } }
  const { result, rerender } = renderHook(input => useCampaignRuntime(input), { initialProps: props })
  const first = result.current
  expect(first).toBeTruthy()
  rerender({ ...props, workspace: null })
  expect(result.current).toBeNull()
  await expect(first.read(() => 'stale')).rejects.toMatchObject({ code: 'disposed' })
  rerender(props)
  expect(result.current).not.toBe(first)
  await expect(result.current.read(() => 'active')).resolves.toBe('active')
})
