import { render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { MvpShell } from './MvpShell.jsx'

const campaign = {
  id: 'campaign-autumn',
  name: 'Autumn launch',
  status: 'copy_ready',
  providerMode: 'mock',
  versions: [],
}

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

    expect(screen.getByRole('heading', { level: 1, name: 'Banner Studio MVP' })).toBeVisible()
    expect(screen.getByText('Mock provider')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Autumn launch' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Current stage content')).toBeVisible()

    const progress = screen.getByRole('navigation', { name: 'Campaign phases' })
    expect(within(progress).getByText('Copy')).toHaveAttribute('data-current', 'true')
    expect(screen.getByRole('complementary', { name: 'Version summary' })).toHaveTextContent('No review version yet')
  })
})
