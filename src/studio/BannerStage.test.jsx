import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { BannerStage } from './BannerStage.jsx'
import { studioTemplates } from '../../shared/studioTemplates.js'

test('carries the selected copy tag into the editor, preview and saved composition', async () => {
  const copy = { id: 'c1', headline: 'Sound for your day', body: 'A little less noise.', cta: 'Shop now', offer: '20% off until Sunday' }
  const workspace = { campaign: { selectedCopyId: 's1', selectedDirectionId: 'd1' }, copies: [{ id: 's1', candidates: [copy], selectedCandidateId: 'c1' }], directions: [{ id: 'd1', previewAssetId: 'image-1' }], composition: null }
  const api = { getAssetBlob: vi.fn(async () => new Blob()) }
  const onSave = vi.fn(async () => {})
  render(<BannerStage workspace={workspace} templates={studioTemplates.map(manifest => ({ id: manifest.id, name: manifest.name, version: manifest.version, manifest }))} api={api} onSave={onSave} />)
  expect(screen.getByLabelText('Tag (optional)')).toHaveValue('20% off until Sunday')
  fireEvent.change(screen.getByLabelText('Tag (optional)'), { target: { value: 'Available until Sunday' } })
  expect(screen.getByRole('img').querySelector('.studio-banner__copy--tag')).toHaveTextContent('Available until Sunday')
  fireEvent.click(screen.getByRole('button', { name: 'Save and check layout' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ templateVersion: '1.1.0', slotValues: { headline: copy.headline, body: copy.body, cta: copy.cta, tag: 'Available until Sunday', image: 'image-1' } })))
})
