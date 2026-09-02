import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App.jsx'
import { readReview, writeReview } from './domain/reviewStore.js'

const appStyles = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

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
    expect(screen.queryByText('local generation', { exact: true })).not.toBeInTheDocument()
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

  test('completes brief processing immediately when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))

    try {
      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: 'Campaign' }))
      fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))

      expect(screen.getByDisplayValue('Speak before you move')).toBeVisible()
      expect(screen.queryByRole('progressbar', { name: 'Brief analysis progress' })).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('presents five shot prompts with separately identified heroes and actions on Copy', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))

    try {
      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: 'Campaign' }))
      fireEvent.click(screen.getByRole('button', { name: 'Analyze brief' }))

      const workbench = screen.getByRole('region', { name: 'Copy and shot planning' })
      expect(within(workbench).getAllByTestId('shot-prompt')).toHaveLength(5)
      expect(within(workbench).getAllByLabelText(/^Hero:/)).toHaveLength(5)
      expect(within(workbench).getAllByLabelText(/^Action:/)).toHaveLength(5)
      expect(within(workbench).getByText('Arrival portrait')).toBeVisible()
      expect(within(workbench).getByText('Evening recap')).toBeVisible()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('shows five prompt directions with semantic tabs and marked subjects and actions', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)

    expect(screen.getByRole('heading', { name: 'AI assets' })).toBeVisible()
    const tabs = screen.getByRole('tablist', { name: 'AI asset types' })
    expect(appStyles).toMatch(/\.asset-tabs\s*\{[^}]*overflow-x:\s*visible;/)
    expect(within(tabs).getByRole('tab', { name: 'Prompts' })).toHaveAttribute('aria-selected', 'true')
    expect(within(tabs).getByRole('tab', { name: 'Static visuals' })).toBeVisible()
    expect(within(tabs).getByRole('tab', { name: 'Videos' })).toBeVisible()

    const promptList = screen.getByRole('list', { name: 'Prompt directions' })
    const promptRows = within(promptList).getAllByRole('listitem')
    expect(promptRows).toHaveLength(5)
    expect(within(promptRows[0]).queryByText('01', { exact: true })).not.toBeInTheDocument()
    promptRows.forEach((row) => {
      expect(within(row).getAllByRole('mark')).toHaveLength(2)
      expect(within(row).queryByText('$0.12 estimated cost')).not.toBeInTheDocument()
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

  test('edits a prompt name and full prompt text inline', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    const promptRow = screen.getAllByTestId('prompt-card')[0]
    await user.click(within(promptRow).getByRole('button', { name: 'Edit prompt Arrival portrait' }))
    const nameField = within(promptRow).getByRole('textbox', { name: 'Prompt name' })
    const promptField = within(promptRow).getByRole('textbox', { name: 'Prompt text' })
    await user.clear(nameField)
    await user.type(nameField, 'Oslo first greeting')
    await user.clear(promptField)
    await user.type(promptField, 'A new Oslo resident practises a confident first greeting beside a tram.')
    await user.click(within(promptRow).getByRole('button', { name: 'Save prompt' }))

    expect(within(promptRow).getByRole('heading', { name: 'Oslo first greeting' })).toBeVisible()
    await user.click(within(promptRow).getByText('Full generated prompt'))
    expect(within(promptRow).getByText('A new Oslo resident practises a confident first greeting beside a tram.')).toBeVisible()
  })

  test('deletes a prompt after inline confirmation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    const promptRow = screen.getAllByTestId('prompt-card')[0]
    await user.click(within(promptRow).getByRole('button', { name: 'Delete prompt Arrival portrait' }))
    expect(within(promptRow).getByText('Delete this prompt?')).toBeVisible()
    await user.click(within(promptRow).getByRole('button', { name: 'Confirm delete Arrival portrait' }))

    expect(screen.getAllByTestId('prompt-card')).toHaveLength(4)
    expect(screen.queryByRole('heading', { name: 'Arrival portrait' })).not.toBeInTheDocument()
  })

  test('downloads the current prompt name and text as a text file', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:prompt-download')
    const revokeObjectURL = vi.fn()
    let downloadedFilename = ''
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloadedFilename = this.download
    })
    const BlobMock = vi.fn(function BlobMock(parts, options) {
      this.parts = parts
      this.options = options
    })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('Blob', BlobMock)
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getByRole('button', { name: 'Download prompt Arrival portrait' }))

    expect(BlobMock).toHaveBeenCalledWith([
      'Arrival portrait\n\neditorial campaign image, tactile natural light, clear subject separation, generous copy space, premium art direction, no text, no logos; shot 1: A new Oslo resident rehearses a first-day Norwegian greeting; eye-level medium portrait · soft morning light; preserve deliberate negative space for the campaign copy\n',
    ], { type: 'text/plain;charset=utf-8' })
    expect(downloadedFilename).toBe('arrival-portrait-prompt.txt')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:prompt-download')
    anchorClick.mockRestore()
    vi.unstubAllGlobals()
  })

  test('generates a static visual and then a video from that image without leaving duplicate outputs', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    const firstPrompt = screen.getAllByTestId('prompt-card')[0]
    await user.click(within(firstPrompt).getByRole('button', { name: /Generate static visual/ }))
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))

    const staticList = screen.getByRole('list', { name: 'Static visuals' })
    const staticAsset = screen.getByTestId('static-asset')
    expect(within(staticList).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getAllByTestId('static-asset')).toHaveLength(1)
    expect(within(staticAsset).getByText('$1.80 per video')).toBeVisible()
    await user.click(within(staticAsset).getByRole('button', { name: 'Generate video from this image for $1.80' }))
    expect(within(staticAsset).getByRole('button', { name: 'Video generated' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Videos' }))
    expect(screen.getAllByTestId('video-asset')).toHaveLength(1)
    expect(screen.queryByText('Simulated motion')).not.toBeInTheDocument()
    expect(screen.queryByText('6 seconds · video · simulated locally')).not.toBeInTheDocument()
    const playPreview = screen.getByRole('button', { name: 'Play video preview Arrival portrait' })
    await user.click(playPreview)
    expect(screen.getByRole('button', { name: 'Pause video preview Arrival portrait' })).toBeVisible()

    const sourceImageAction = screen.getByRole('button', { name: 'View source image Arrival portrait' })
    expect(sourceImageAction).toHaveTextContent('Source image')
    await user.click(sourceImageAction)
    expect(screen.getByRole('tab', { name: 'Static visuals' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('static-asset')).toHaveAttribute('data-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Prompts' }))
    await user.click(within(firstPrompt).getByRole('button', { name: /Generate static visual/ }))
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    expect(screen.getAllByTestId('static-asset')).toHaveLength(1)
  })

  test('copies the full originating prompt from a static visual', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getByRole('button', { name: 'Copy prompt for Arrival portrait' }))

    expect(writeText).toHaveBeenCalledWith('editorial campaign image, tactile natural light, clear subject separation, generous copy space, premium art direction, no text, no logos; shot 1: A new Oslo resident rehearses a first-day Norwegian greeting; eye-level medium portrait · soft morning light; preserve deliberate negative space for the campaign copy')
    expect(screen.getByRole('button', { name: 'Prompt copied for Arrival portrait' })).toBeVisible()
  })

  test('renames a static image and cascades its deletion to the derived video', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getByRole('button', { name: 'Rename image Arrival portrait' }))
    const imageName = screen.getByRole('textbox', { name: 'Image name' })
    await user.clear(imageName)
    await user.type(imageName, 'Morning arrival')
    await user.click(screen.getByRole('button', { name: 'Save image name' }))
    expect(screen.getByText('Morning arrival')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Generate video from this image for $1.80' }))
    await user.click(screen.getByRole('button', { name: 'Delete image Arrival portrait' }))
    expect(screen.getByText('Delete this image and its video?')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm delete image Arrival portrait' }))
    expect(screen.queryByTestId('static-asset')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Videos' }))
    expect(screen.queryByTestId('video-asset')).not.toBeInTheDocument()
  })

  test('renames and deletes a video without removing its source image', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getByRole('button', { name: 'Generate video from this image for $1.80' }))
    await user.click(screen.getByRole('tab', { name: 'Videos' }))
    await user.click(screen.getByRole('button', { name: 'Rename video Arrival portrait' }))
    const videoName = screen.getByRole('textbox', { name: 'Video name' })
    await user.clear(videoName)
    await user.type(videoName, 'Greeting motion')
    await user.click(screen.getByRole('button', { name: 'Save video name' }))
    expect(screen.getByText('Greeting motion')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Delete video Arrival portrait' }))
    expect(screen.getByText('Delete this video?')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm delete video Arrival portrait' }))
    expect(screen.queryByTestId('video-asset')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    expect(screen.getByTestId('static-asset')).toBeVisible()
  })

  test('downloads static and video asset payloads', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAssetsWorkspace(user)
    await user.click(screen.getAllByRole('button', { name: /Generate static visual/ })[0])
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getByRole('button', { name: 'Generate video from this image for $1.80' }))

    const createObjectURL = vi.fn(() => 'blob:asset-download')
    const revokeObjectURL = vi.fn()
    const downloadedFilenames = []
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloadedFilenames.push(this.download)
    })
    const BlobMock = vi.fn(function BlobMock(parts, options) {
      this.parts = parts
      this.options = options
    })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('Blob', BlobMock)

    await user.click(screen.getByRole('button', { name: 'Download image Arrival portrait' }))
    await user.click(screen.getByRole('tab', { name: 'Videos' }))
    await user.click(screen.getByRole('button', { name: 'Download video Arrival portrait' }))

    expect(JSON.parse(BlobMock.mock.calls[0][0][0])).toMatchObject({ mediaType: 'static', title: 'Arrival portrait' })
    expect(JSON.parse(BlobMock.mock.calls[1][0][0])).toMatchObject({ mediaType: 'video', title: 'Arrival portrait' })
    expect(downloadedFilenames).toEqual(['nordic-portrait-image.json', 'nordic-portrait-video.json'])
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    anchorClick.mockRestore()
    vi.unstubAllGlobals()
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
    expect(dialog.querySelector(':scope > .cost-dialog__content')).toBeInTheDocument()
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

  test('keeps a direct non-default campaign context across reference navigation and template return', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/campaign/campaign-first-week')
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('button', { name: 'Select template Reverse split' }))

    expect(window.location.pathname).toBe('/campaign/campaign-first-week')

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Design system' }))
    await user.click(screen.getByRole('button', { name: 'Campaign' }))

    expect(window.location.pathname).toBe('/campaign/campaign-first-week')
  })

  test.each([
    ['in-review', 'Waiting for designer review'],
    ['ready-for-approval', 'Banners are ready for approval'],
    ['approved', 'Delivery'],
  ])('hydrates a persisted %s package to its latest permitted stage', (status, heading) => {
    writeReview('campaign-first-week', createPersistedReview(status))
    window.history.replaceState({}, '', '/campaign/campaign-first-week')
    render(<App />)

    expect(screen.getByRole('heading', { name: heading })).toBeVisible()
  })

  test('renders a persisted in-review package from Stage 5 without local banner state', async () => {
    const user = userEvent.setup()
    writeReview('campaign-first-week', createPersistedReview('in-review'))
    window.history.replaceState({}, '', '/campaign/campaign-first-week')
    render(<App />)

    await user.click(screen.getByRole('button', { name: '5. Prepare for review: Review package' }))

    expect(screen.getByRole('region', { name: 'Review package' })).toHaveAttribute('data-status', 'in-review')
    expect(screen.getByTestId('review-banner-thumbnail')).toBeVisible()
  })

  test('keeps persisted-only review navigation out of empty earlier stages', async () => {
    const user = userEvent.setup()
    writeReview('campaign-first-week', createPersistedReview('in-review'))
    window.history.replaceState({}, '', '/campaign/campaign-first-week')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Waiting for designer review' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '5. Prepare for review: Review package' }))
    expect(screen.getByRole('heading', { name: 'Prepare for review' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back to banner preview' }))

    expect(screen.getByRole('heading', { name: 'Prepare for review' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Banner preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Copy' })).not.toBeInTheDocument()

    for (const number of [1, 2, 3, 4]) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${number}\\.`) }))
      expect(screen.getByRole('heading', { name: 'Prepare for review' })).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Banner preview' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Copy' })).not.toBeInTheDocument()
    }
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

    const submittedReview = readReview('campaign-oslo-intensive')
    act(() => {
      writeReview('campaign-oslo-intensive', {
        ...submittedReview,
        status: 'ready-for-approval',
        designerName: 'Avery Brooks',
        reviewedAt: '2026-09-02T09:15:00.000Z',
        selectedBanners: submittedReview.selectedBanners.map(({ motionPreset, ...banner }) => banner),
        motionByBannerId: {
          ...submittedReview.motionByBannerId,
          [submittedReview.selectedBanners[0].id]: { text: 'type-reveal' },
        },
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

    const submittedReview = readReview('campaign-oslo-intensive')
    submittedReview.selectedBanners.forEach((banner) => {
      expect(banner.motionPreset).toMatchObject({ text: 'fade-up', image: 'soft-zoom', cta: 'pop-in' })
      expect(submittedReview.motionByBannerId[banner.id]).toMatchObject({ text: 'fade-up', image: 'soft-zoom', cta: 'pop-in' })
    })

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

    expect(appStyles).toMatch(/\.banner-filter--platform select\s*\{[^}]*width:\s*198px;/)

    await openAssetsWorkspace(user)
    const staticAction = screen.getAllByRole('button', { name: /Generate static visual/ })[0]
    await user.click(staticAction)
    await user.click(screen.getByRole('tab', { name: 'Static visuals' }))
    await user.click(screen.getByRole('button', { name: 'Generate video from this image for $1.80' }))
    await user.click(screen.getByRole('button', { name: 'Continue to banner preview' }))
    await user.click(screen.getByRole('button', { name: 'Video' }))
    await user.click(screen.getByRole('button', { name: 'Format: Vertical' }))
    await user.click(screen.getByRole('option', { name: 'Horizontal' }))
    expect(screen.getByText('No banner compositions match these filters.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('button', { name: 'Select template Reverse split' }))

    expect(screen.getByRole('button', { name: 'Format: Vertical' })).toBeVisible()
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
    await user.click(screen.getByRole('button', { name: 'Selected for Figma assembly' }))

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

  function createPersistedReview(status) {
    return {
      status,
      figmaUrl: 'https://www.figma.com/file/campaign-first-week/lingu-studio-review',
      selectedBanners: [{
        id: 'banner-persisted',
        templateId: 'split-left',
        templateName: 'Split frame',
        format: 'Vertical',
        dimensions: '1080×1350',
        platform: 'SMM Static',
        mediaType: 'static',
        sourceAssetId: 'static-persisted',
        sourceStaticId: 'static-persisted',
        template: { id: 'split-left', name: 'Split frame', layout: 'split-left', alignment: 'left', family: 'split', masterRatio: 'portrait', index: 1 },
        visual: { id: 'static-persisted', name: 'Persisted visual', direction: 'Natural light', motif: 'portrait', palette: ['#e8d8c6', '#6d81a7', '#1d2940'] },
        content: { headline: 'Persisted banner', body: 'Ready to resume', offer: '15% off', cta: 'Start learning' },
        motionPreset: { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 },
      }],
      selectedBannerIds: ['banner-persisted'],
      motionByBannerId: { 'banner-persisted': { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 } },
      generatedAssets: [],
      submittedAt: '2026-09-02T09:00:00.000Z',
      reviewedAt: status === 'in-review' ? null : '2026-09-02T09:10:00.000Z',
      approvedAt: status === 'approved' ? '2026-09-02T09:20:00.000Z' : null,
      designerName: status === 'in-review' ? null : 'Jordan Lee',
      marketerName: status === 'approved' ? 'Maya Chen' : null,
    }
  }
})
