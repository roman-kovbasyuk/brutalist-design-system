import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { templates } from '../data/templates.js'
import { BannerWorkspace } from './BannerWorkspace.jsx'

const candidates = [
  { id: 'banner-static-vertical', templateId: 'split-left', templateName: 'Split frame', format: 'Vertical', dimensions: '1080×1350', platform: 'SMM Static', mediaType: 'static', sourceAssetId: 'static-nordic', sourceStaticId: 'static-nordic' },
  { id: 'banner-static-horizontal', templateId: 'split-left', templateName: 'Split frame', format: 'Horizontal', dimensions: '1200×628', platform: 'Google Ads', mediaType: 'static', sourceAssetId: 'static-nordic', sourceStaticId: 'static-nordic' },
  { id: 'banner-static-square', templateId: 'split-left', templateName: 'Split frame', format: 'Square', dimensions: '1080×1080', platform: 'SMM Static', mediaType: 'static', sourceAssetId: 'static-nordic', sourceStaticId: 'static-nordic' },
  { id: 'banner-video-vertical', templateId: 'split-left', templateName: 'Split frame', format: 'Vertical', dimensions: '1080×1920', platform: 'Video Reels', mediaType: 'video', sourceAssetId: 'video-static-nordic', sourceStaticId: 'static-nordic' },
]

function BannerWorkspaceHarness({ withVideo = true }) {
  const [filters, setFilters] = useState({ format: 'Vertical', platform: 'SMM Static', media: 'static' })
  const [selectedBannerIds, setSelectedBannerIds] = useState([])
  const [activeBannerId, setActiveBannerId] = useState('banner-static-vertical')
  const [motionByBannerId, setMotionByBannerId] = useState({})

  function updateMotion(bannerId, channel, preset) {
    setMotionByBannerId((current) => ({
      ...current,
      [bannerId]: { ...(current[bannerId] ?? {}), [channel]: preset, replayVersion: (current[bannerId]?.replayVersion ?? 0) + 1 },
    }))
  }

  function replayMotion(bannerId) {
    setMotionByBannerId((current) => ({
      ...current,
      [bannerId]: { ...(current[bannerId] ?? {}), replayVersion: (current[bannerId]?.replayVersion ?? 0) + 1 },
    }))
  }

  return (
    <BannerWorkspace
      candidates={withVideo ? candidates : candidates.filter((candidate) => candidate.mediaType === 'static')}
      templates={templates}
      staticAssets={[{ id: 'static-nordic', name: 'Nordic portrait' }]}
      videoAssets={[{ id: 'video-static-nordic', name: 'Nordic portrait motion' }]}
      content={{ headline: 'Speak before you move', body: 'Practical Norwegian', offer: '15% off', cta: 'Start learning' }}
      filters={filters}
      onFiltersChange={setFilters}
      selectedBannerIds={selectedBannerIds}
      onSelectedBannerIdsChange={setSelectedBannerIds}
      activeBannerId={activeBannerId}
      onActiveBannerChange={setActiveBannerId}
      motionByBannerId={motionByBannerId}
      onMotionChange={updateMotion}
      onReplayMotion={replayMotion}
    />
  )
}

describe('BannerWorkspace', () => {
  test('filters exact candidate format, platform, and media combinations', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness />)

    expect(screen.getAllByTestId('banner-candidate')).toHaveLength(1)
    expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-static-vertical')

    await user.selectOptions(screen.getByLabelText('Format'), 'Horizontal')
    expect(screen.getByText('No banner compositions match these filters.')).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Platform'), 'Google Ads')
    expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-static-horizontal')

    await user.click(screen.getByRole('button', { name: 'Video' }))
    expect(screen.getByLabelText('Format')).toHaveValue('Vertical')
    expect(screen.getByLabelText('Platform')).toHaveValue('Video Reels')
    expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-video-vertical')
  })

  test('only exposes the Static and Video toggle when a linked video is available', () => {
    const { rerender } = render(<BannerWorkspaceHarness withVideo={false} />)

    expect(screen.queryByRole('group', { name: 'Banner media' })).not.toBeInTheDocument()

    rerender(<BannerWorkspaceHarness withVideo />)
    expect(screen.getByRole('group', { name: 'Banner media' })).toBeVisible()
  })

  test('keeps Figma assembly selections while filters change', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness />)

    await user.click(screen.getByRole('button', { name: 'Select for Figma assembly' }))
    expect(screen.getByText('1 selected for Figma assembly')).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Format'), 'Horizontal')
    await user.selectOptions(screen.getByLabelText('Platform'), 'Google Ads')
    expect(screen.getByText('1 selected for Figma assembly')).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Format'), 'Vertical')
    await user.selectOptions(screen.getByLabelText('Platform'), 'SMM Static')
    expect(screen.getByRole('button', { name: 'Select for Figma assembly' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('opens exact banner details and replays independent motion channels', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness />)

    await user.click(screen.getByRole('button', { name: /Open Split frame, 1080×1350 preview/ }))
    const detail = screen.getByRole('region', { name: 'Banner detail preview' })
    expect(within(detail).getByText('1080×1350')).toBeVisible()
    expect(within(detail).getByText('Nordic portrait')).toBeVisible()
    expect(within(detail).getByText('Static')).toBeVisible()

    await user.selectOptions(within(detail).getByLabelText('Text motion'), 'type-reveal')
    expect(within(detail).getByRole('article').querySelector('.motion-copy')).toHaveAttribute('data-motion-preset', 'type-reveal')
    const initialVersion = within(detail).getByRole('article').getAttribute('data-motion-version')
    fireEvent.click(within(detail).getByRole('button', { name: 'Replay motion' }))
    expect(within(detail).getByRole('article')).toHaveAttribute('data-motion-version', String(Number(initialVersion) + 1))
  })
})
