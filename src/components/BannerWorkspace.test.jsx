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

const comparisonCandidates = [
  candidates[0],
  { id: 'banner-reverse-static-vertical', templateId: 'split-right', templateName: 'Reverse split', format: 'Vertical', dimensions: '1080×1350', platform: 'SMM Static', mediaType: 'static', sourceAssetId: 'static-nordic', sourceStaticId: 'static-nordic' },
]

function BannerWorkspaceHarness({ withVideo = true, candidateSet = candidates }) {
  const [filters, setFilters] = useState({ format: 'Vertical', platform: 'SMM Static', media: 'static' })
  const [selectedBannerIds, setSelectedBannerIds] = useState([])
  const [activeBannerId, setActiveBannerId] = useState(null)
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
      candidates={withVideo ? candidateSet : candidateSet.filter((candidate) => candidate.mediaType === 'static')}
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
  test('uses an icon-led custom menu for every banner format', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness />)

    const trigger = screen.getByRole('button', { name: 'Format: Vertical' })
    expect(trigger.querySelector('svg')).toBeInTheDocument()
    await user.click(trigger)

    const menu = screen.getByRole('listbox', { name: 'Format options' })
    ;['All', 'Horizontal', 'Vertical', 'Square'].forEach((format) => {
      const option = within(menu).getByRole('option', { name: format })
      expect(option.querySelector('svg')).toBeInTheDocument()
    })
    await user.click(within(menu).getByRole('option', { name: 'Horizontal' }))
    const horizontalTrigger = screen.getByRole('button', { name: 'Format: Horizontal' })
    expect(horizontalTrigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(horizontalTrigger)
    await user.keyboard('{ArrowDown}{Enter}')
    const verticalTrigger = screen.getByRole('button', { name: 'Format: Vertical' })
    await user.click(verticalTrigger)
    await user.keyboard('{Escape}')
    expect(verticalTrigger).toHaveFocus()
    expect(screen.queryByRole('listbox', { name: 'Format options' })).not.toBeInTheDocument()
  })

  test('filters exact candidate format, platform, and media combinations', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness />)

    expect(screen.getAllByTestId('banner-candidate')).toHaveLength(1)
    expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-static-vertical')
    expect(screen.getAllByRole('option', { name: 'All' })).toHaveLength(1)

    await chooseFormat(user, 'Horizontal')
    expect(screen.getByText('No banner compositions match these filters.')).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Platform'), 'Google Ads')
    expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-static-horizontal')

    await user.click(screen.getByRole('button', { name: 'Video' }))
    expect(screen.getByRole('button', { name: 'Format: Vertical' })).toBeVisible()
    expect(screen.getByLabelText('Platform')).toHaveValue('Video Reels')
    expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-video-vertical')
  })

  test('only exposes the Static and Video toggle when a linked video is available', () => {
    const { rerender } = render(<BannerWorkspaceHarness withVideo={false} />)

    expect(screen.queryByRole('group', { name: 'Banner media' })).not.toBeInTheDocument()

    rerender(<BannerWorkspaceHarness withVideo />)
    expect(screen.getByRole('group', { name: 'Banner media' })).toBeVisible()
  })

  test('normalizes video filters when the selected static visual has no linked video', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<BannerWorkspaceHarness />)

    await user.click(screen.getByRole('button', { name: 'Video' }))
    expect(screen.getByLabelText('Platform')).toHaveValue('Video Reels')

    rerender(<BannerWorkspaceHarness withVideo={false} />)
    expect(screen.queryByRole('group', { name: 'Banner media' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Format: Vertical' })).toBeVisible()
    expect(screen.getByLabelText('Platform')).toHaveValue('SMM Static')
    expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-static-vertical')
  })

  test('keeps Figma assembly selections while filters change', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness />)

    const candidate = screen.getByTestId('banner-candidate')
    await user.click(screen.getByRole('button', { name: 'Select for Figma assembly' }))
    expect(screen.getByText('1 selected for Figma assembly')).toBeVisible()
    expect(candidate).toHaveAttribute('data-selected', 'true')
    expect(candidate.querySelector('.banner-candidate__check')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Banner detail preview' })).not.toBeInTheDocument()

    await chooseFormat(user, 'Horizontal')
    await user.selectOptions(screen.getByLabelText('Platform'), 'Google Ads')
    expect(screen.getByText('1 selected for Figma assembly')).toBeVisible()

    await chooseFormat(user, 'Vertical')
    await user.selectOptions(screen.getByLabelText('Platform'), 'SMM Static')
    const selectedAction = screen.getByRole('button', { name: 'Selected for Figma assembly' })
    expect(selectedAction).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('banner-candidate').querySelector('.banner-candidate__check svg')).toBeInTheDocument()
  })

  test('opens exact banner details and replays independent motion channels', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness />)

    expect(screen.queryByRole('dialog', { name: 'Banner detail preview' })).not.toBeInTheDocument()
    const opener = screen.getByRole('button', { name: /Open Split frame, 1080×1350 preview/ })
    await user.click(opener)
    const detail = screen.getByRole('dialog', { name: 'Banner detail preview' })
    expect(within(detail).getByRole('button', { name: 'Close banner preview' })).toHaveFocus()
    ;[
      ['Template', 'Split frame'],
      ['Dimensions', '1080×1350'],
      ['Format', 'Vertical'],
      ['Platform', 'SMM Static'],
      ['Media type', 'Static'],
      ['Source visual', 'Nordic portrait'],
    ].forEach(([label, value]) => {
      expect(within(detail).getByText(label)).toBeVisible()
      expect(within(detail).getByText(value)).toBeVisible()
    })

    await user.selectOptions(within(detail).getByLabelText('Text motion'), 'type-reveal')
    expect(within(detail).getByRole('article').querySelector('.motion-copy')).toHaveAttribute('data-motion-preset', 'type-reveal')
    const initialVersion = within(detail).getByRole('article').getAttribute('data-motion-version')
    fireEvent.click(within(detail).getByRole('button', { name: 'Replay motion' }))
    expect(within(detail).getByRole('article')).toHaveAttribute('data-motion-version', String(Number(initialVersion) + 1))

    await user.click(within(detail).getByRole('button', { name: 'Close banner preview' }))
    expect(screen.queryByRole('dialog', { name: 'Banner detail preview' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  test('keeps text, image, and CTA motion independent for every banner', async () => {
    const user = userEvent.setup()
    render(<BannerWorkspaceHarness withVideo={false} candidateSet={comparisonCandidates} />)

    await user.click(screen.getByRole('button', { name: /Open Split frame, 1080×1350 preview/ }))
    let detail = screen.getByRole('dialog', { name: 'Banner detail preview' })
    await user.selectOptions(within(detail).getByLabelText('Text motion'), 'type-reveal')

    await user.click(screen.getByRole('button', { name: /Open Reverse split, 1080×1350 preview/ }))
    detail = screen.getByRole('dialog', { name: 'Banner detail preview' })
    await user.selectOptions(within(detail).getByLabelText('Image motion'), 'pan-up')
    await user.selectOptions(within(detail).getByLabelText('CTA motion'), 'pulse')
    expect(within(detail).getByRole('article').querySelector('.motion-copy')).toHaveAttribute('data-motion-preset', 'fade-up')
    expect(within(detail).getByRole('article').querySelector('.motion-media')).toHaveAttribute('data-motion-preset', 'pan-up')
    expect(within(detail).getByRole('article').querySelector('.motion-cta')).toHaveAttribute('data-motion-preset', 'pulse')

    await user.click(screen.getByRole('button', { name: /Open Split frame, 1080×1350 preview/ }))
    detail = screen.getByRole('dialog', { name: 'Banner detail preview' })
    expect(within(detail).getByRole('article').querySelector('.motion-copy')).toHaveAttribute('data-motion-preset', 'type-reveal')
    expect(within(detail).getByRole('article').querySelector('.motion-media')).toHaveAttribute('data-motion-preset', 'soft-zoom')
    expect(within(detail).getByRole('article').querySelector('.motion-cta')).toHaveAttribute('data-motion-preset', 'pop-in')
  })

  async function chooseFormat(user, format) {
    await user.click(screen.getByRole('button', { name: /^Format:/ }))
    await user.click(screen.getByRole('option', { name: format }))
  }
})
