import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { BannerStage } from './BannerStage.jsx'
import { studioTemplates } from '../../shared/studioTemplates.js'

test('carries the selected copy tag into every template preview and saves source identities', async () => {
  const copy = { id: 'c1', headline: 'Sound for your day', body: 'A little less noise.', cta: 'Shop now', offer: '20% off until Sunday' }
  const workspace = { campaign: { selectedCopyId: 's1', selectedDirectionId: 'd1' }, copies: [{ id: 's1', candidates: [copy], selectedCandidateId: 'c1' }], directions: [{ id: 'd1', status: 'ready', title: 'Visual one', previewAssetId: 'image-1' }], composition: null }
  const api = { getAssetBlob: vi.fn(async () => new Blob()) }
  const onSave = vi.fn(async () => ({ ok: true }))
  render(<BannerStage workspace={workspace} templates={studioTemplates.map(manifest => ({ id: manifest.id, name: manifest.name, version: manifest.version, manifest }))} api={api} onSave={onSave} onPrepareReview={async () => ({ ok: true })} onNext={() => {}} />)
  expect(screen.getAllByRole('img')).toHaveLength(3)
  for (const image of screen.getAllByRole('img')) expect(image.querySelector('.studio-banner__copy--tag')).toHaveTextContent('20% off until Sunday')
  fireEvent.click(screen.getByRole('button', { name: 'Select Editorial split' }))
  fireEvent.click(screen.getByRole('button', { name: 'Send to Figma' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and prepare review' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ designs: [{ templateId: 'editorial-split', templateVersion: studioTemplates[0].version, copySetId: 's1', copyId: 'c1', directionId: 'd1' }], ratioIds: ['square'] }, { expectedInputKey: undefined }))
})
