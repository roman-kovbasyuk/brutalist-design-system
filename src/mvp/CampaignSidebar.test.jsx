import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar.jsx'
import { CampaignSidebar } from './CampaignSidebar.jsx'

const campaigns = [
  { id: 'campaign-autumn', name: 'Autumn launch', status: 'copy_ready' },
  { id: 'campaign-winter', name: 'Winter launch', status: 'draft' },
]

function renderSidebar(props = {}) {
  const onSelectCampaign = props.onSelectCampaign ?? vi.fn()
  render(
    <SidebarProvider>
      <CampaignSidebar
        campaigns={campaigns}
        activeCampaign={campaigns[0]}
        actor={{ id: 'maya', name: 'Maya Chen', role: 'marketer' }}
        onSelectCampaign={onSelectCampaign}
        onCreateCampaign={vi.fn()}
        {...props}
      />
    </SidebarProvider>,
  )
  return { onSelectCampaign }
}

describe('Campaign sidebar', () => {
  test('shows new campaign, recent campaigns, active state, and user footer', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: 'New campaign' })).toBeVisible()
    expect(screen.getByText('Recent campaigns')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Autumn launch' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('Maya Chen')).toBeVisible()
    expect(screen.getByText('Marketer')).toBeVisible()
  })

  test('selects a campaign from the sidebar', async () => {
    const user = userEvent.setup()
    const { onSelectCampaign } = renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Winter launch' }))

    expect(onSelectCampaign).toHaveBeenCalledWith('campaign-winter')
  })
})
