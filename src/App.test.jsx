import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App.jsx'
import { readReview, writeReview } from './domain/reviewStore.js'

describe('Lingu Studio app', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  test('shows the dashboard by default with the production metric strip', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Campaign production' })).toBeVisible()
    expect(screen.getByText('Total banners created')).toBeVisible()
    expect(screen.getByText('Total reviews')).toBeVisible()
    expect(screen.getByText('GenAI production cost')).toBeVisible()
    expect(screen.getByText('Static-to-video ratio')).toBeVisible()
  })

  test('renders every campaign history field in a semantic table', () => {
    render(<App />)

    const table = screen.getByRole('table', { name: 'Campaign history' })
    ;['Date', 'Status', 'Campaign', 'Banners', 'Total generations', 'Static visuals', 'Videos', 'Production cost', 'Action'].forEach((column) => {
      expect(within(table).getByRole('columnheader', { name: column })).toBeVisible()
    })
    const osloRow = within(table).getByRole('row', { name: /Sep 2, 2026 In review Oslo intensive launch 16 12 8 4 \$8\.16/ })
    expect(within(osloRow).getByRole('cell', { name: 'Sep 2, 2026' })).toBeVisible()
    expect(within(osloRow).getByRole('cell', { name: 'In review' })).toBeVisible()
    expect(within(osloRow).getByRole('rowheader', { name: 'Oslo intensive launch' })).toBeVisible()
    expect(within(osloRow).getByRole('cell', { name: '16' })).toBeVisible()
    expect(within(osloRow).getByRole('cell', { name: '12' })).toBeVisible()
    expect(within(osloRow).getByRole('cell', { name: '8' })).toBeVisible()
    expect(within(osloRow).getByRole('cell', { name: '4' })).toBeVisible()
    expect(within(osloRow).getByRole('cell', { name: '$8.16' })).toBeVisible()
  })

  test('opens a campaign workspace from a history row', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open Oslo intensive launch' }))

    expect(window.location.pathname).toBe('/campaign/campaign-oslo-intensive')
    expect(screen.getByLabelText('Campaign idea')).toBeVisible()
  })

  test('shows determinate local brief processing before opening Copy', async () => {
    vi.useFakeTimers()
    try {
      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: 'Campaign' }))
      fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))

      expect(screen.getByRole('progressbar', { name: 'Brief analysis progress' })).toHaveAttribute('aria-valuenow', '20')
      expect(screen.getByText('Analyzing the brief with AI', { selector: '[aria-live]' })).toBeVisible()
      expect(screen.queryByDisplayValue('Speak before you move')).not.toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(250)
      })
      expect(screen.getByText('Identifying audience and offer', { selector: '[aria-live]' })).toBeVisible()

      for (let phase = 0; phase < 4; phase += 1) {
        await act(async () => {
          vi.advanceTimersByTime(250)
        })
      }
      expect(screen.getByDisplayValue('Speak before you move')).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  test('shows five prompt directions with semantic tabs and marked subjects and actions', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)

    expect(screen.getByRole('heading', { name: 'AI assets' })).toBeVisible()
    const tabs = screen.getByRole('tablist', { name: 'AI asset types' })
    expect(within(tabs).getByRole('tab', { name: 'Prompts' })).toHaveAttribute('aria-selected', 'true')
    expect(within(tabs).getByRole('tab', { name: 'Static visuals' })).toBeVisible()
    expect(within(tabs).getByRole('tab', { name: 'Videos' })).toBeVisible()

    const promptCards = screen.getAllByTestId('prompt-card')
    expect(promptCards).toHaveLength(5)
    promptCards.forEach((card) => {
      expect(within(card).getAllByRole('mark')).toHaveLength(2)
      expect(within(card).getByText('$0.12 estimated cost')).toBeVisible()
    })

    const promptTab = within(tabs).getByRole('tab', { name: 'Prompts' })
    promptTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(within(tabs).getByRole('tab', { name: 'Static visuals' })).toHaveFocus()
    expect(within(tabs).getByRole('tab', { name: 'Static visuals' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(within(tabs).getByRole('tab', { name: 'Videos' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(within(tabs).getByRole('tab', { name: 'Prompts' })).toHaveFocus()
  })

  test('generates a static visual and then a video from that image without leaving duplicate outputs', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    const firstPrompt = screen.getAllByTestId('prompt-card')[0]
    await user.click(within(firstPrompt).getByRole('button', { name: /Generate static visual/ }))
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))

    const staticAsset = screen.getByTestId('static-asset')
    expect(screen.getAllByTestId('static-asset')).toHaveLength(1)
    expect(within(staticAsset).getByText('$1.80 per video')).toBeVisible()
    await user.click(within(staticAsset).getByRole('button', { name: 'Generate video from this image for $1.80' }))
    expect(within(staticAsset).getByRole('button', { name: 'Video generated' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Videos' }))
    expect(screen.getAllByTestId('video-asset')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'View source static visual Nordic portrait' }))
    expect(screen.getByRole('tab', { name: 'Static visuals' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('static-asset')).toHaveAttribute('data-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Prompts' }))
    await user.click(within(firstPrompt).getByRole('button', { name: /Generate static visual/ }))
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    expect(screen.getAllByTestId('static-asset')).toHaveLength(1)
  })

  test('supports a keyboard-only flow to generate a video from a static visual', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))

    const videoAction = screen.getByRole('button', { name: 'Generate video from this image for $1.80' })
    await user.tab()
    await user.tab()
    expect(videoAction).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('tab', { name: 'Videos' }))
    expect(screen.getAllByTestId('video-asset')).toHaveLength(1)
  })

  test('confirms the exact bulk video cost and only generates videos that are missing', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    const [firstPrompt, secondPrompt] = screen.getAllByTestId('prompt-card')
    await user.click(within(firstPrompt).getByRole('button', { name: /Generate static visual/ }))
    await user.click(within(secondPrompt).getByRole('button', { name: /Generate static visual/ }))
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getAllByRole('button', { name: /Generate video from this image/ })[0])

    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const bulkAction = screen.getByRole('button', { name: 'Generate videos for all images' })
    await user.click(bulkAction)
    const dialog = screen.getByRole('dialog', { name: 'Confirm video generation cost' })
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(dialog).getByText('1 eligible image')).toBeVisible()
    expect(within(dialog).getByText('$1.80 per video')).toBeVisible()
    expect(within(dialog).getByText('$1.80 total estimated cost')).toBeVisible()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(bulkAction).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Confirm video generation cost' })).not.toBeInTheDocument()

    await user.click(bulkAction)
    await user.click(screen.getByRole('button', { name: 'Generate 1 video for $1.80' }))
    showModal.mockRestore()

    await user.click(screen.getByRole('tab', { name: 'Videos' }))
    expect(screen.getAllByTestId('video-asset')).toHaveLength(2)
  })

  test('routes supported pathnames and responds to browser navigation', async () => {
    window.history.replaceState({}, '', '/templates')
    render(<App />)

    expect(screen.getAllByTestId('template-card')).toHaveLength(20)

    window.history.pushState({}, '', '/system')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByRole('heading', { name: 'Design system' })).toBeVisible()
  })

  test('shows the campaign workspace and designer review alias for direct URLs', () => {
    window.history.replaceState({}, '', '/campaign/campaign-first-week')
    const { rerender } = render(<App />)

    expect(screen.getByLabelText('Campaign idea')).toBeVisible()

    window.history.replaceState({}, '', '/review/campaign-first-week')
    window.dispatchEvent(new PopStateEvent('popstate'))
    rerender(<App />)

    expect(screen.getByRole('heading', { name: 'Designer review' })).toBeVisible()
  })

  test('keeps the designer endpoint honest when no submitted package exists', () => {
    window.history.replaceState({}, '', '/designer/campaign-first-week')
    render(<App />)

    expect(screen.getByText('No banner package has been submitted for review yet.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mark banners ready for approval' })).toBeDisabled()
  })

  test('exposes dashboard, campaign, templates, and design system as primary destinations', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('button', { name: 'Campaign' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Templates' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Design system' })).toBeVisible()
  })

  test('waits for the designer store update, then records marketer approval before Delivery', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Campaign' }))

    const brief = screen.getByLabelText('Campaign idea')
    await user.clear(brief)
    await user.type(
      brief,
      'Launch a Norwegian language intensive. Offer 15% off until Sunday for people moving to Oslo.',
    )
    await user.click(screen.getByRole('button', { name: 'Analyze brief' }))

    expect(await screen.findByDisplayValue('Speak before you move', {}, { timeout: 2000 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Generate visuals' }))

    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))

    expect(screen.getByRole('heading', { name: 'Banner preview' })).toBeVisible()
    expect(screen.getAllByTestId('banner-candidate')).toHaveLength(20)
    const continueToReview = screen.getByRole('button', { name: 'Continue to prepare for review' })
    expect(continueToReview).toBeDisabled()
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.selectOptions(screen.getByLabelText('Text motion'), 'type-reveal')
    await user.click(continueToReview)

    await user.click(screen.getByRole('button', { name: 'Send to Figma for review' }))
    await user.click(screen.getByRole('button', { name: 'Continue to Approval' }))

    expect(screen.getByRole('heading', { name: 'Waiting for designer review' })).toBeVisible()
    expect(screen.getByRole('button', { name: '7. Delivery: Assets and manifest' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Open designer review' })).toHaveAttribute('href', '/review/campaign-oslo-intensive')

    act(() => {
      writeReview('campaign-oslo-intensive', {
        ...readReview('campaign-oslo-intensive'),
        status: 'ready-for-approval',
        designerName: 'Avery Brooks',
        reviewedAt: '2026-09-02T09:15:00.000Z',
      })
    })

    expect(await screen.findByRole('heading', { name: 'Banners are ready for approval' })).toBeVisible()
    expect(screen.getByText('Avery Brooks’s designer review is recorded. Confirming records Maya Chen as the marketer approver.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm review' }))

    expect(screen.getByRole('heading', { name: 'Delivery' })).toBeVisible()
    const productionSummary = screen.getByRole('list', { name: 'Production summary' })
    expect(within(productionSummary).getByText('Designer reviewed: Avery Brooks')).toBeVisible()
    expect(within(productionSummary).getByText('Marketer approved: Maya Chen')).toBeVisible()
    expect(within(productionSummary).getByText('Formats: 4')).toBeVisible()
    expect(within(productionSummary).getByText('Selected video count: 0')).toBeVisible()
    expect(within(productionSummary).getByText('Total assets: 4')).toBeVisible()
    expect(within(productionSummary).getByText('Total simulated production cost: $0.12')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download assets' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download manifest' })).toBeVisible()

    const createObjectURL = vi.fn(() => 'blob:lingu-download')
    const revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const BlobMock = vi.fn(function BlobMock(parts, options) {
      this.parts = parts
      this.options = options
    })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('Blob', BlobMock)
    await user.click(screen.getByRole('button', { name: 'Download assets' }))
    await user.click(screen.getByRole('button', { name: 'Download manifest' }))
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(anchorClick).toHaveBeenCalledTimes(2)
    expect(JSON.parse(BlobMock.mock.calls[0][0][0]).assets[0]).toMatchObject({
      mediaType: 'static',
      motionPreset: { text: 'type-reveal' },
    })
    anchorClick.mockRestore()
    vi.unstubAllGlobals()

    expect(screen.getAllByText('1080×1080').some((element) => !element.closest('[hidden]'))).toBe(true)
    expect(screen.getAllByText('1080×1350').some((element) => !element.closest('[hidden]'))).toBe(true)
    expect(screen.getAllByText('1080×1920').some((element) => !element.closest('[hidden]'))).toBe(true)
    expect(screen.getAllByText('1200×628').some((element) => !element.closest('[hidden]'))).toBe(true)
    const deliveryPreviews = screen.getAllByRole('article', { name: 'Template preview Split frame' }).filter((element) => element.closest('.resize-grid'))
    expect(deliveryPreviews).toHaveLength(4)
    deliveryPreviews.forEach((preview) => {
      expect(preview.querySelector('.motion-copy')).toHaveAttribute('data-motion-preset', 'type-reveal')
    })

    act(() => {
      writeReview('campaign-oslo-intensive', {
        ...readReview('campaign-oslo-intensive'),
        status: 'draft',
      })
    })
    expect(await screen.findByRole('heading', { name: 'Prepare for review' })).toBeVisible()
  })

  test('resets campaign-scoped workflow state when the campaign id changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    expect(screen.getByRole('heading', { name: 'AI assets' })).toBeVisible()

    window.history.pushState({}, '', '/campaign/campaign-first-week')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByRole('heading', { name: 'Tell us your campaign idea' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'AI assets' })).not.toBeInTheDocument()
  })

  test('shows every selected banner in the Stage 5 review package and keeps the submitted state visible', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getByRole('button', { name: 'Generate video from this image for $1.80' }))
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: 'Video' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to prepare for review' }))

    expect(screen.getAllByTestId('review-banner-thumbnail')).toHaveLength(2)
    const reviewTable = screen.getByRole('table', { name: 'Selected banners for review' })
    expect(within(reviewTable).getAllByRole('row')).toHaveLength(3)
    expect(within(reviewTable).getByRole('columnheader', { name: 'Banner' })).toBeVisible()
    expect(within(reviewTable).getByRole('columnheader', { name: 'Dimensions' })).toBeVisible()
    expect(within(reviewTable).getByRole('columnheader', { name: 'Platform' })).toBeVisible()
    expect(within(reviewTable).getByRole('columnheader', { name: 'Media type' })).toBeVisible()
    expect(within(reviewTable).getByRole('columnheader', { name: 'Motion' })).toBeVisible()
    expect(screen.getAllByText('Video').find((element) => element.classList.contains('review-video-badge'))).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Send to Figma for review' }))

    const reviewWorkspace = screen.getByRole('region', { name: 'Review package' })
    expect(reviewWorkspace).toHaveAttribute('data-status', 'in-review')
    expect(screen.getByRole('link', { name: 'Open Figma review' })).toHaveClass('review-figma-link')
    expect(screen.getByText('You will be notified by email and Slack')).toBeVisible()
    expect(screen.getByText('Local simulation')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue to Approval' })).toBeVisible()
  })

  test('lets only the designer endpoint move a submitted package to ready for approval', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to prepare for review' }))
    await user.click(screen.getByRole('button', { name: 'Send to Figma for review' }))

    window.history.pushState({}, '', '/designer/campaign-oslo-intensive')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByRole('heading', { name: 'Designer review' })).toBeVisible()
    expect(screen.getAllByTestId('review-banner-thumbnail').filter((element) => !element.closest('[hidden]'))).toHaveLength(1)
    expect(screen.getByLabelText('Reviewer name')).toHaveValue('Jordan Lee')
    await user.click(screen.getByRole('button', { name: 'Mark banners ready for approval' }))

    expect(screen.getAllByText('Ready for approval').find((element) => element.classList.contains('campaign-status') && !element.closest('[hidden]'))).toBeVisible()
    expect(readReview('campaign-oslo-intensive')).toMatchObject({
      status: 'ready-for-approval',
      designerName: 'Jordan Lee',
    })
  })

  test('invalidates a live review for copy changes but not for an unselected generation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to prepare for review' }))
    await user.click(screen.getByRole('button', { name: 'Send to Figma for review' }))

    await user.click(screen.getByRole('button', { name: 'Back to banner preview' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[1])
    expect(readReview('campaign-oslo-intensive')).toMatchObject({ status: 'in-review' })

    await user.click(screen.getByRole('button', { name: '2. Copy: Audience, offer, and copy' }))
    await user.type(screen.getByLabelText('Headline'), ' updated')

    expect(readReview('campaign-oslo-intensive')).toMatchObject({ status: 'draft' })
  })

  test('shows all twenty templates in the library view', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Templates' }))
    expect(screen.getAllByTestId('template-card')).toHaveLength(20)
  })

  test('returns a library template choice to its matching banner candidate without skipping preview', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('button', { name: 'Select template Reverse split' }))

    expect(screen.getByRole('heading', { name: 'Banner preview' })).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Banner detail preview' })).getByText('Reverse split')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue to prepare for review' })).toBeDisabled()
  })

  test('focuses a library template candidate after incompatible banner filters', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    const staticAction = screen.getAllByRole('button', { name: /Generate static visual/ })[0]
    await user.click(staticAction)
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getByRole('button', { name: 'Generate video from this image for $1.80' }))
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getByRole('button', { name: 'Video' }))
    await user.selectOptions(screen.getByLabelText('Format'), 'Horizontal')
    expect(screen.getByText('No banner compositions match these filters.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('button', { name: 'Select template Reverse split' }))

    expect(screen.getByLabelText('Format')).toHaveValue('Vertical')
    expect(screen.getByLabelText('Platform')).toHaveValue('Video Reels')
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('region', { name: 'Banner detail preview' })).getByText('Reverse split')).toBeVisible()
  })

  test('uses a selected banner rather than an unselected preview for Stage 5 review rows', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: /Open Reverse split, 1080×1350 preview/ }))
    await user.click(screen.getByRole('button', { name: 'Continue to prepare for review' }))

    const reviewTable = screen.getByRole('table', { name: 'Selected banners for review' })
    expect(within(reviewTable).getByRole('rowheader', { name: 'Split frame' })).toBeVisible()
    expect(within(reviewTable).queryByRole('rowheader', { name: 'Reverse split' })).not.toBeInTheDocument()
  })

  test('closes the Stage 5 rail path after the last banner selection is cleared', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to prepare for review' }))
    await user.click(screen.getByRole('button', { name: 'Back to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])

    expect(screen.getByRole('button', { name: '5. Prepare for review: Review package' })).toBeDisabled()
  })

  test('closes the Stage 5 rail path when a library choice replaces selected banners', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to prepare for review' }))
    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('button', { name: 'Select template Reverse split' }))

    expect(screen.getByRole('button', { name: '5. Prepare for review: Review package' })).toBeDisabled()
  })

  test('preserves campaign progress while visiting reference screens', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Campaign' }))

    await user.click(screen.getByRole('button', { name: 'Analyze brief' }))
    expect(await screen.findByDisplayValue('Speak before you move', {}, { timeout: 2000 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('button', { name: 'Campaign' }))

    expect(screen.getByDisplayValue('Speak before you move')).toBeVisible()
  })

  test('documents tokens and the shared banner content contract', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Design system' }))
    expect(screen.getByRole('heading', { name: 'Design system' })).toBeVisible()
    expect(screen.getByText('headline')).toBeVisible()
    expect(screen.getByText('1080×1920')).toBeVisible()
  })

  test('resets the viewport when global navigation changes the screen', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Templates' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  })

  async function openAssetsWorkspace(user) {
    await user.click(screen.getByRole('button', { name: 'Campaign' }))
    await user.click(screen.getByRole('button', { name: 'Analyze brief' }))
    expect(await screen.findByDisplayValue('Speak before you move', {}, { timeout: 2000 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Generate visuals' }))
  }
})
