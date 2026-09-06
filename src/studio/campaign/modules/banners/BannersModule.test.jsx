import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import { projectModuleInput } from '../../moduleContracts.js'
import BannersModule from './BannersModule.jsx'

it('restores a legacy composition as a selected design without writing on mount', async () => {
  const { workspace, templates } = makeScenario('composed')
  const port = { input: projectModuleInput('banners', workspace, { templates }), inputKey: 'source', access: { canEdit: true }, operation: { kind: 'idle' }, actions: { save: vi.fn().mockResolvedValue({ ok: false, message: 'Conflict' }) }, assets: { getAssetBlob: vi.fn().mockRejectedValue(new Error('offline')) }, setDirty: vi.fn(), navigate: vi.fn() }
  const { rerender } = render(<BannersModule port={port} />)
  expect(screen.getByRole('button', { name: 'Deselect Editorial split' })).toHaveAttribute('aria-pressed', 'true')
  rerender(<BannersModule port={{ ...port, inputKey: 'new-source', input: { ...port.input } }} />)
  expect(screen.getByRole('button', { name: 'Deselect Editorial split' })).toHaveAttribute('aria-pressed', 'true')
  expect(port.setDirty).toHaveBeenLastCalledWith(false)
  expect(port.actions.save).not.toHaveBeenCalled()
})
