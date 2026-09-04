import { CircleUserRound, MessageSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button.jsx'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar.jsx'

export function CampaignSidebar({ campaigns, activeCampaign, actor, onSelectCampaign, onCreateCampaign }) {
  const { isMobile, setOpenMobile } = useSidebar()

  function selectCampaign(campaignId) {
    onSelectCampaign(campaignId)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar className="mvp-sidebar" collapsible="icon" variant="sidebar">
      <SidebarHeader className="mvp-sidebar__header">
        <div className="mvp-brand">
          <span className="mvp-brand__mark" aria-hidden="true">B</span>
          <h1>Banner Studio</h1>
          <SidebarTrigger className="mvp-sidebar__collapse" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Button className="mvp-new-campaign" type="button" onClick={onCreateCampaign}>
              <Plus aria-hidden="true" />
              <span>New campaign</span>
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Recent campaigns</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {campaigns.map((campaign) => {
                const isActive = campaign.id === activeCampaign?.id
                return (
                  <SidebarMenuItem key={campaign.id}>
                    <SidebarMenuButton
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={campaign.name}
                      data-active={isActive ? 'true' : 'false'}
                      isActive={isActive}
                      title={campaign.name}
                      tooltip={campaign.name}
                      type="button"
                      onClick={() => selectCampaign(campaign.id)}
                    >
                      <MessageSquare aria-hidden="true" />
                      <span>{campaign.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
            {campaigns.length === 0 && <p className="mvp-sidebar__empty">No campaigns yet</p>}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
        <div className="mvp-actor">
          <span className="mvp-actor__avatar" aria-hidden="true">
            <CircleUserRound />
          </span>
          <span className="mvp-actor__copy">
            <strong>{actor.name}</strong>
            <small>{titleCase(actor.role)}</small>
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function titleCase(value) {
  return String(value).replace(/^./, (letter) => letter.toUpperCase())
}
