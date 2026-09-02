import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import App from './App.jsx'

describe('Lingu Studio app', () => {
  test('exposes workflow, templates, and design system as primary destinations', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('button', { name: 'Process' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('button', { name: 'Templates' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Design system' })).toBeVisible()
  })

  test('completes the controlled flow and blocks final formats until approval', async () => {
    const user = userEvent.setup()
    render(<App />)

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

    await user.click(screen.getByRole('button', { name: 'Analyze brief' }))
    expect(screen.getByDisplayValue('Speak before you move')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('button', { name: 'Process' }))

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
