import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { campaignHistory } from '../data/campaigns.js'
import { writeReview } from '../domain/reviewStore.js'
import { DesignerReviewScreen } from './DesignerReviewScreen.jsx'

const campaign = campaignHistory[0]

describe('DesignerReviewScreen', () => {
  beforeEach(() => window.localStorage.clear())

  test.each([
    ['draft', 'Package needs a new submission', 'Draft'],
    ['ready-for-approval', 'Banners are ready for marketer approval', 'Ready for approval'],
    ['approved', 'Package approved', 'Approved'],
  ])('does not present a %s package as active review', (status, heading, badge) => {
    writeReview(campaign.id, createReview(status))
    render(<DesignerReviewScreen campaign={campaign} campaignId={campaign.id} />)

    expect(screen.getByRole('heading', { name: heading })).toBeVisible()
    expect(screen.getByText(badge, { selector: '.campaign-status' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Mark banners ready for approval' })).not.toBeInTheDocument()
  })

  test('offers the ready action only while the package is actively in review', () => {
    writeReview(campaign.id, createReview('in-review'))
    render(<DesignerReviewScreen campaign={campaign} campaignId={campaign.id} />)

    expect(screen.getByText('In review', { selector: '.campaign-status' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mark banners ready for approval' })).toBeEnabled()
  })
})

function createReview(status) {
  return {
    status,
    figmaUrl: 'https://www.figma.com/file/campaign-oslo-intensive/lingu-studio-review',
    selectedBanners: [{
      id: 'banner-designer',
      templateId: 'split-left',
      templateName: 'Split frame',
      format: 'Vertical',
      dimensions: '1080×1350',
      platform: 'SMM Static',
      mediaType: 'static',
      sourceAssetId: 'static-designer',
      sourceStaticId: 'static-designer',
      template: { id: 'split-left', name: 'Split frame', layout: 'split-left', alignment: 'left', family: 'split', masterRatio: 'portrait', index: 1 },
      visual: { id: 'static-designer', name: 'Designer visual', direction: 'Natural light', motif: 'portrait', palette: ['#e8d8c6', '#6d81a7', '#1d2940'] },
      content: { headline: 'Review package', body: 'Lifecycle evidence', offer: '15% off', cta: 'Start learning' },
      motionPreset: { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 },
    }],
    selectedBannerIds: ['banner-designer'],
    motionByBannerId: { 'banner-designer': { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 } },
    generatedAssets: [],
    submittedAt: '2026-09-02T09:00:00.000Z',
    reviewedAt: status === 'in-review' ? null : '2026-09-02T09:10:00.000Z',
    approvedAt: status === 'approved' ? '2026-09-02T09:20:00.000Z' : null,
    designerName: status === 'in-review' ? null : 'Jordan Lee',
    marketerName: status === 'approved' ? 'Maya Chen' : null,
  }
}
