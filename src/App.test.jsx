import { render, screen, within } from '@testing-library/react'
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

    expect(screen.getByDisplayValue('Speak before you move')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Generate visuals' }))

    expect(screen.getAllByRole('button', { name: /Select visual/ })).toHaveLength(5)
    await user.click(screen.getAllByRole('button', { name: /Select visual/ })[0])
    await user.click(screen.getByRole('button', { name: 'Choose a template' }))

    expect(screen.getAllByTestId('template-option')).toHaveLength(20)
    await user.click(screen.getAllByRole('button', { name: /Select template/ })[0])
    await user.click(screen.getByRole('button', { name: 'Build draft' }))

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

  test('preserves campaign progress while visiting reference screens', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Campaign' }))

    await user.click(screen.getByRole('button', { name: 'Analyze brief' }))
    expect(screen.getByDisplayValue('Speak before you move')).toBeVisible()
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
})
