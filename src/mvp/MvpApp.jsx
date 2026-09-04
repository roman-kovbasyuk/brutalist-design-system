import { useEffect, useMemo, useState } from 'react'
import { mockActors } from './fixtures.js'
import { createMockCampaignGateway } from './mockCampaignGateway.js'
import { MvpShell } from './MvpShell.jsx'
import './mvp.css'

const stageHeading = {
  draft: 'Draft campaign',
  copy_ready: 'Copy selected',
  direction_selected: 'Visual direction selected',
  composed: 'Composition ready',
  in_review: 'Designer review',
  changes_requested: 'Changes requested',
  ready: 'Ready for approval',
  approved: 'Approved version',
  delivered: 'Delivery complete',
}

export function MvpApp({ gateway: providedGateway }) {
  const gateway = useMemo(() => providedGateway ?? createMockCampaignGateway(), [providedGateway])
  const [campaigns, setCampaigns] = useState([])
  const [activeCampaignId, setActiveCampaignId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const actor = mockActors.marketer
  const activeCampaign = campaigns.find((campaign) => campaign.id === activeCampaignId) ?? campaigns[0] ?? null

  useEffect(() => {
    let active = true
    gateway.listCampaigns()
      .then((items) => {
        if (!active) return
        setCampaigns(items)
        setActiveCampaignId((current) => current ?? items[0]?.id ?? null)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'campaigns_unavailable')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [gateway])

  async function createCampaign(event) {
    event.preventDefault()
    const name = campaignName.trim()
    if (!name) return
    setError('')
    try {
      const created = await gateway.createCampaign({ name }, {
        actor,
        idempotencyKey: `create-campaign-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      })
      setCampaigns((items) => [created, ...items])
      setActiveCampaignId(created.id)
      setCampaignName('')
      setShowCreate(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'campaign_create_failed')
    }
  }

  if (loading) return <div className="mvp-loading" role="status">Loading campaigns…</div>

  return (
    <MvpShell
      campaigns={campaigns}
      activeCampaign={activeCampaign}
      actor={actor}
      onSelectCampaign={setActiveCampaignId}
      onCreateCampaign={() => setShowCreate(true)}
    >
      {error && <div className="mvp-alert" role="alert">{error}</div>}
      {showCreate && (
        <form className="mvp-create-form" onSubmit={createCampaign}>
          <label htmlFor="mvp-campaign-name">Campaign name</label>
          <input id="mvp-campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} autoFocus />
          <div className="mvp-actions">
            <button className="mvp-button mvp-button--primary" type="submit">Create and open</button>
            <button className="mvp-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}
      {!showCreate && activeCampaign && (
        <div className="mvp-stage-intro">
          <p className="mvp-eyebrow">{activeCampaign.name}</p>
          <h2>{stageHeading[activeCampaign.status]}</h2>
          <p>This review build exposes the workflow decisions first. Brief and generation controls arrive in the next review slice.</p>
        </div>
      )}
      {!showCreate && !activeCampaign && (
        <div className="mvp-empty-state">
          <h2>No campaigns yet</h2>
          <p>Create the first campaign to review the complete MVP workflow.</p>
          <button className="mvp-button mvp-button--primary" type="button" onClick={() => setShowCreate(true)}>Create campaign</button>
        </div>
      )}
    </MvpShell>
  )
}
