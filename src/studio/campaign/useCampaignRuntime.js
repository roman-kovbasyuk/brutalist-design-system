import { useEffect, useRef, useState } from 'react'
import { createCampaignRuntime } from './campaignRuntime.js'

/** A runtime lives for one actor/campaign, not for one workspace revision. */
export function useCampaignRuntime({ api, actor, templates, workspace, onCampaignChange, onError }) {
  const [entry, setEntry] = useState(null)
  const latest = useRef({ workspace, templates, onCampaignChange, onError })
  latest.current = { workspace, templates, onCampaignChange, onError }
  const id = workspace?.campaign.id
  useEffect(() => {
    if (!id || !actor?.id) return
    let lease
    try {
      const runtime = createCampaignRuntime({ api, actor, templates: latest.current.templates, workspace: latest.current.workspace,
        onCampaignChange: campaign => latest.current.onCampaignChange?.(campaign) })
      lease = { runtime, id, actorId: actor.id, role: actor.role, api, active: true }
      setEntry(lease)
    } catch (error) { latest.current.onError?.(error) }
    return () => { if (lease) { lease.active = false; lease.runtime.dispose() } }
  }, [api, id, actor?.id, actor?.role])
  return entry?.active && entry.api === api && entry.id === id && entry.actorId === actor?.id && entry.role === actor?.role ? entry.runtime : null
}
