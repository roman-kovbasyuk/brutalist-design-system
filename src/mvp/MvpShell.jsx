import { Check, Circle, Plus } from 'lucide-react'

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
      <header className="mvp-topbar">
        <div>
          <p className="mvp-eyebrow">Logic review build</p>
          <h1>Banner Studio MVP</h1>
        </div>
        <div className="mvp-topbar__meta">
          <span className="mvp-provider-badge">Mock provider</span>
          <span>{actor.name} · {titleCase(actor.role)}</span>
        </div>
      </header>

      <div className="mvp-layout">
        <aside className="mvp-campaign-rail" aria-label="MVP campaigns">
          <div className="mvp-rail-heading">
            <h2>Campaigns</h2>
            <button className="mvp-icon-button" type="button" aria-label="Create new campaign" onClick={onCreateCampaign}>
              <Plus size={17} aria-hidden="true" />
            </button>
          </div>
          {campaigns.length > 0 ? campaigns.map((campaign) => (
            <button
              className="mvp-campaign-button"
              type="button"
              key={campaign.id}
              aria-label={campaign.name}
              aria-current={campaign.id === activeCampaign?.id ? 'page' : undefined}
              onClick={() => onSelectCampaign(campaign.id)}
            >
              <span>{campaign.name}</span>
              <small>{humanStatus(campaign.status)}</small>
            </button>
          )) : <p className="mvp-empty-note">No campaigns yet</p>}
        </aside>

        <section className="mvp-workspace">
          {activeCampaign && (
            <nav className="mvp-phase-rail" aria-label="Campaign phases">
              {phases.map((phase, index) => (
                <div className="mvp-phase" data-complete={index < currentPhase ? 'true' : undefined} data-current={index === currentPhase ? 'true' : undefined} key={phase}>
                  {index < currentPhase ? <Check size={15} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
                  <span data-current={index === currentPhase ? 'true' : undefined}>{phase}</span>
                </div>
              ))}
            </nav>
          )}
          <div className="mvp-stage">{children}</div>
        </section>

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
            <dl>
              <div><dt>Status</dt><dd>{humanStatus(activeCampaign.status)}</dd></div>
              <div><dt>Provider</dt><dd>{titleCase(activeCampaign.providerMode)}</dd></div>
            </dl>
          )}
        </aside>
      </div>
    </div>
  )
}

function humanStatus(value) {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function titleCase(value) {
  return String(value).replace(/^./, (letter) => letter.toUpperCase())
}
