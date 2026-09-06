import { Component, Suspense, useEffect, useMemo, useState } from 'react'
import { WorkflowModuleFrame } from '../../components/design-system/organisms/WorkflowModuleFrame.jsx'
import { AppButton } from '../../components/design-system/atoms/AppButton.jsx'
import { AsyncStatus } from '../../components/design-system/molecules/AsyncStatus.jsx'
import { ErrorNotice } from '../primitives.jsx'
import { useCampaignModule } from './useCampaignModule.js'
import { moduleRegistry } from './moduleRegistry.js'
import { MODULE_LABELS } from './moduleContracts.js'

class ModuleBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return <div role="alert"><p>This module could not be displayed. The other modules are still available.</p>
      <AppButton onClick={() => this.setState({ error: null })}>Retry module</AppButton></div>
  }
}

export function ModuleHost({ runtime, moduleId, actions, onNavigate, requestedTemplate, active = false }) {
  const [actionError, setActionError] = useState(null)
  const guardedActions = useMemo(() => Object.fromEntries(Object.entries(actions ?? {}).map(([name, action]) => [name, async (...args) => {
    setActionError(null)
    try {
      const result = await action(...args)
      if (result?.ok === false) setActionError(result)
      return result
    } catch (error) { setActionError(error); throw error }
  }])), [actions])
  const port = useCampaignModule(runtime, moduleId, moduleId === 'visuals' ? actions : guardedActions, onNavigate)
  const canRender = port.access.canVisit || ['copy', 'visuals'].includes(moduleId)
  const [activated, setActivated] = useState(() => canRender
    && (active || typeof globalThis.IntersectionObserver !== 'function'))
  useEffect(() => {
    if (activated || !canRender) return
    if (active || typeof globalThis.IntersectionObserver !== 'function') {
      setActivated(true)
      return
    }
    const element = document.getElementById(`campaign-module-${moduleId}`)
    if (!element) return
    const observer = new globalThis.IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setActivated(true)
    }, { rootMargin: '400px 0px', threshold: 0.01 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [active, activated, canRender, moduleId])
  const View = moduleRegistry[moduleId]
  const moduleOwnsProgress = ['brief', 'visuals'].includes(moduleId)
  const moduleOwnsError = moduleId === 'visuals'
  return <WorkflowModuleFrame id={`campaign-module-${moduleId}`} title={MODULE_LABELS[moduleId]} busy={port.operation.kind === 'running'}>
    {port.operation.kind === 'running' && !moduleOwnsProgress && <AsyncStatus>Working on {MODULE_LABELS[moduleId].toLowerCase()}…</AsyncStatus>}
    <ErrorNotice error={['visuals', 'banners'].includes(moduleId) && !moduleOwnsError ? port.operation.error ?? actionError : null} />
    {moduleId !== 'visuals' && (port.operation.error || actionError) && <AppButton onClick={async () => {
      try { await runtime.refresh(); setActionError(null) } catch (error) { setActionError(error) }
    }}>Check latest state</AppButton>}
    {!port.access.canVisit && !['copy', 'visuals'].includes(moduleId) && <p className="bs-note">Complete the preceding module first.</p>}
    {activated && <ModuleBoundary><Suspense fallback={<p role="status">Loading {MODULE_LABELS[moduleId]}…</p>}>
      <View port={{ ...port, operation: { ...port.operation, error: port.operation.error ?? (moduleId === 'visuals' ? null : actionError) },
        reconcile: moduleId === 'visuals' ? () => runtime.refresh() : undefined, requestedTemplate }} />
    </Suspense></ModuleBoundary>}
  </WorkflowModuleFrame>
}
