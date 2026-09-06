import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AssetImage } from './primitives.jsx'

afterEach(() => vi.unstubAllGlobals())

test('module asset reader renders a blob and revokes its URL on unmount', async () => {
  const createObjectURL = vi.fn(() => 'blob:module-image')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }))
  const assets = { getAssetBlob: async () => new Blob(['image'], { type: 'image/png' }) }
  const view = render(<AssetImage assets={assets} assetId="image-1" alt="Generated direction" />)
  expect(await screen.findByRole('img', { name: 'Generated direction' })).toHaveAttribute('src', 'blob:module-image')
  view.unmount()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:module-image')
})

test('unmount aborts the read and ignores a late response', async () => {
  const createObjectURL = vi.fn()
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }))
  let finish, signal
  const assets = { getAssetBlob: (_id, options) => {
    signal = options.signal
    return new Promise(resolve => { finish = resolve })
  } }
  const view = render(<AssetImage assets={assets} assetId="image-1" alt="Generated direction" />)
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => finish(new Blob(['late'])))
  expect(createObjectURL).not.toHaveBeenCalled()
})
