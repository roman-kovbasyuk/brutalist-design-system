import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App.jsx'

describe('Lingu Studio app', () => {
  beforeEach(() => {
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

  test('shows the campaign workspace and simulated designer review for direct URLs', () => {
    window.history.replaceState({}, '', '/campaign/campaign-first-week')
    const { rerender } = render(<App />)

    expect(screen.getByLabelText('Campaign idea')).toBeVisible()

    window.history.replaceState({}, '', '/designer/campaign-first-week')
    window.dispatchEvent(new PopStateEvent('popstate'))
    rerender(<App />)

    expect(screen.getByRole('heading', { name: 'Designer review' })).toBeVisible()
  })

  test('marks designer banners ready through the local simulated review route', async () => {
    window.history.replaceState({}, '', '/designer/campaign-first-week')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Mark banners ready' }))

    expect(screen.getByText('Banners are ready for approval')).toBeVisible()
    expect(screen.getByText(/Figma review is simulated locally/)).toBeVisible()
  })

  test('exposes dashboard, campaign, templates, and design system as primary destinations', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('button', { name: 'Campaign' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Templates' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Design system' })).toBeVisible()
  })

  test('completes the controlled flow and blocks final formats until approval', async () => {
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
    await user.click(continueToReview)

    expect(screen.getAllByText('Speak before you move').some((element) => !element.closest('[hidden]'))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Prepare Figma packet' }))
    const reviewPacket = screen.getByRole('region', { name: 'Review packet' })
    expect(within(reviewPacket).getByText('split-left')).toBeVisible()
    expect(within(reviewPacket).getByText(/Launch a Norwegian language intensive/)).toBeVisible()
    expect(within(reviewPacket).getByText(/editorial campaign image/)).toBeVisible()
    expect(within(reviewPacket).getByText(/vertical motion loop/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Send for review' }))

    expect(screen.getAllByText('1200×628').every((element) => element.closest('[hidden]'))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Confirm review' }))
    await user.click(screen.getByRole('button', { name: 'Build final package' }))

    expect(screen.getAllByText('1080×1080').some((element) => !element.closest('[hidden]'))).toBe(true)
    expect(screen.getAllByText('1080×1350').some((element) => !element.closest('[hidden]'))).toBe(true)
    expect(screen.getAllByText('1080×1920').some((element) => !element.closest('[hidden]'))).toBe(true)
    expect(screen.getAllByText('1200×628').some((element) => !element.closest('[hidden]'))).toBe(true)
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

  test('uses a selected banner rather than an unselected preview for Stage 5 compatibility', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getAllByRole('button', { name: 'Select for Figma assembly' })[0])
    await user.click(screen.getByRole('button', { name: /Open Reverse split, 1080×1350 preview/ }))
    await user.click(screen.getByRole('button', { name: 'Continue to prepare for review' }))

    expect(screen.getByText('01 · Split frame')).toBeVisible()
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
