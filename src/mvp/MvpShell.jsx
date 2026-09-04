import { Check, Circle } from 'lucide-react'
import { Badge } from '@/components/ui/badge.jsx'
import { Separator } from '@/components/ui/separator.jsx'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.jsx'
import { TooltipProvider } from '@/components/ui/tooltip.jsx'
import { CampaignSidebar } from './CampaignSidebar.jsx'

const phases = ['Brief', 'Copy', 'Image ideas', 'Templates', 'Review', 'Approval', 'Delivery']
const statusPhase = {
  draft: 0,
  copy_ready: 1,
  direction_selected: 2,
  composed: 3,
  in_review: 4,
  changes_requested: 4,
  ready: 5,
  approved: 6,
  delivered: 6,
}

export function MvpShell({ campaigns, activeCampaign, actor, onSelectCampaign, onCreateCampaign, children }) {
  const currentPhase = activeCampaign ? statusPhase[activeCampaign.status] ?? 0 : 0
  const currentVersion = activeCampaign?.versions?.at(-1)

  return (
    <div className="mvp-root mvp-shell">
      <TooltipProvider>
        <SidebarProvider
          className="mvp-sidebar-provider"
          style={{ '--sidebar-width': '17rem', '--sidebar-width-icon': '3.5rem' }}
        >
          <CampaignSidebar
            campaigns={campaigns}
            activeCampaign={activeCampaign}
            actor={actor}
            onSelectCampaign={onSelectCampaign}
            onCreateCampaign={onCreateCampaign}
          />

          <SidebarInset className="mvp-inset">
            <header className="mvp-topbar">
              <div className="mvp-topbar__title">
                <SidebarTrigger />
                <div>
                  <p>Campaign</p>
                  <strong>{activeCampaign?.name ?? 'No campaign selected'}</strong>
                </div>
              </div>
              <Badge className="mvp-provider-badge" variant="outline">Mock provider</Badge>
            </header>

            {activeCampaign && (
              <nav className="mvp-phase-rail" aria-label="Campaign phases">
                {phases.map((phase, index) => (
                  <div
                    className="mvp-phase"
                    data-complete={index < currentPhase ? 'true' : undefined}
                    data-current={index === currentPhase ? 'true' : undefined}
                    key={phase}
                  >
                    {index < currentPhase ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                    <span data-current={index === currentPhase ? 'true' : undefined}>{phase}</span>
                  </div>
                ))}
              </nav>
            )}

            <div className="mvp-content-grid">
              <div className="mvp-workspace">
                <div className="mvp-stage">{children}</div>
              </div>

              <aside className="mvp-version-summary" aria-label="Version summary">
                <p className="mvp-eyebrow">Current version</p>
                {currentVersion ? (
                  <>
                    <strong>Version {currentVersion.number}</strong>
                    <span>{humanStatus(currentVersion.status)}</span>
                    <code>{currentVersion.contentHash.slice(0, 12)}</code>
                  </>
                ) : (
                  <p>No review version yet</p>
                )}
                {activeCampaign && (
                  <>
                    <Separator />
                    <dl>
                      <div><dt>Status</dt><dd>{humanStatus(activeCampaign.status)}</dd></div>
                      <div><dt>Provider</dt><dd>{titleCase(activeCampaign.providerMode)}</dd></div>
                    </dl>
                  </>
                )}
              </aside>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}

function humanStatus(value) {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function titleCase(value) {
  return String(value).replace(/^./, (letter) => letter.toUpperCase())
}
