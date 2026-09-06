import { useCallback, useEffect, useMemo, useRef } from 'react'
import { CampaignTimeline } from '../CampaignTimeline.jsx'
import { MODULE_IDS } from './moduleContracts.js'
import { ModuleHost } from './ModuleHost.jsx'
import { useCampaignModule } from './useCampaignModule.js'
import { createWorkflowCoordinator } from './workflowCoordinator.js'

function ModuleTimeline({ runtime, activeModule, onNavigate }) {
  // Fixed six subscriptions: the timeline has no command or workspace access.
  const brief = useCampaignModule(runtime, 'brief')
  const copy = useCampaignModule(runtime, 'copy')
  const visuals = useCampaignModule(runtime, 'visuals')
  const banners = useCampaignModule(runtime, 'banners')
  const review = useCampaignModule(runtime, 'review')
  const distribute = useCampaignModule(runtime, 'distribute')
  const ports = [brief, copy, visuals, banners, review, distribute]
  const current = ports.findLast(port => port.access.canVisit)?.access.id ?? 'brief'
  const active = ports.find(port => port.access.id === activeModule && port.access.canVisit)?.access.id ?? current
  const items = ports.map(({ access }) => ({ label: access.label, context: access.stale ? 'Needs updating' : '',
    href: `#campaign-module-${access.id}`, current: access.id === active, complete: access.complete, disabled: !access.canVisit }))
  return <CampaignTimeline items={items} activeModule={active} onChange={index => onNavigate(MODULE_IDS[index])} />
}

/** Layout only. Module behavior belongs to its view/commands and the coordinator. */
export function CampaignPage({ runtime, activeModule, onNavigate, heading, requestedTemplate, analyzeOnOpen = false, onAnalysisStarted }) {
  const navigation = useRef(onNavigate)
  navigation.current = onNavigate
  const navigate = useCallback(id => navigation.current?.(id), [])
  const coordinator = useMemo(() => createWorkflowCoordinator({ runtime, onNavigate: navigate }), [runtime, navigate])
  const started = useRef(false)
  useEffect(() => coordinator.observeInitialDrafts(), [coordinator])
  useEffect(() => {
    if (analyzeOnOpen && !started.current) {
      started.current = true
      onAnalysisStarted?.()
      void coordinator.analyzeAndGenerate()
    }
  }, [analyzeOnOpen, coordinator, onAnalysisStarted])
  return <div className="bs-campaign-layout">
    <div className="bs-campaign-heading">{heading}</div>
    <ModuleTimeline runtime={runtime} activeModule={activeModule} onNavigate={navigate} />
    <div className="bs-stage">{MODULE_IDS.map(id => <ModuleHost key={id} runtime={runtime} moduleId={id}
      actions={coordinator.actions[id]} onNavigate={navigate} active={id === activeModule}
      requestedTemplate={id === 'banners' ? requestedTemplate : undefined} />)}</div>
  </div>
}
