import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MvpShell } from './MvpShell.jsx'

const campaign = {
  id: 'campaign-autumn',
  name: 'Autumn launch',
  status: 'copy_ready',
  providerMode: 'mock',
  versions: [],
}

const winterCampaign = {
  ...campaign,
  id: 'campaign-winter',
  name: 'Winter launch',
  status: 'draft',
}

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
})

describe('MVP shell', () => {
  test('shows campaigns, phase progress, provider mode, and version summary', () => {
    render(
      <MvpShell
        campaigns={[campaign]}
        activeCampaign={campaign}
        actor={{ id: 'maya', name: 'Maya Chen', role: 'marketer' }}
        onSelectCampaign={vi.fn()}
        onCreateCampaign={vi.fn()}
      >
        <p>Current stage content</p>
      </MvpShell>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Banner Studio' })).toBeVisible()
    expect(screen.getByText('Mock provider')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Autumn launch' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('Current stage content')).toBeVisible()

    const progress = screen.getByRole('navigation', { name: 'Campaign phases' })
    expect(within(progress).getByText('Copy')).toHaveAttribute('data-current', 'true')
    expect(screen.getByRole('complementary', { name: 'Version summary' })).toHaveTextContent('No review version yet')
  })

  test('closes the mobile campaign sheet after a campaign is selected', async () => {
    const user = userEvent.setup()
    const onSelectCampaign = vi.fn()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 })
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    render(
      <MvpShell
        campaigns={[campaign, winterCampaign]}
        activeCampaign={campaign}
        actor={{ id: 'maya', name: 'Maya Chen', role: 'marketer' }}
        onSelectCampaign={onSelectCampaign}
        onCreateCampaign={vi.fn()}
      >
        <p>Current stage content</p>
      </MvpShell>,
    )

    await user.click(await screen.findByRole('button', { name: 'Toggle Sidebar' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Winter launch' }))

    expect(onSelectCampaign).toHaveBeenCalledWith('campaign-winter')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
