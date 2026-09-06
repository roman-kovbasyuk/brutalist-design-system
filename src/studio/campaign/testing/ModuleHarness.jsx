import { Suspense, useMemo } from 'react'
import { moduleRegistry } from '../moduleRegistry.js'
import { WorkflowModuleFrame } from '../../../components/design-system/organisms/WorkflowModuleFrame.jsx'
import { projectModuleInput, moduleInputKey } from '../moduleContracts.js'
import { deriveWorkflowState } from '../workflowState.js'

const fixtureAssets = Object.freeze({ getAssetBlob: async () => new Blob([], { type: 'image/png' }) })

function safeFixtureResult(name, scenario) {
  if (name === 'loadTemplateVersion') return (id, version) => {
    const template = scenario.templates.find(item => item.id === id)
    if (!template) throw new TypeError(`Fixture template not found: ${id}@${version}`)
    return { ...structuredClone(template), version }
  }
  if (name === 'extractFile') return { ok: true, text: 'Fixture campaign brief text.' }
  if (name === 'download') return new Blob(['fixture delivery'], { type: 'application/zip' })
  if (name === 'prepareReview') return { ok: true, requestId: 'fixture-request', version: scenario.workspace.versions[0] ?? null }
  if (name === 'createVersion') return { ok: true, version: scenario.workspace.versions[0] ?? null }
  if (name === 'saveBatch') return { ok: true, reviewInputKey: 'fixture-review-input' }
  if (['markReady', 'requestChanges', 'approve', 'reject', 'reopen'].includes(name)) {
    return { ok: true, receipt: { id: 'fixture-receipt', requestId: 'fixture-request', fixture: true } }
  }
  return { ok: true, requestId: 'fixture-request', jobId: 'fixture-job' }
}

/** Test-only module boundary. No shell, auth, network client, or live records. */
export function ModuleHarness({ moduleId, scenario, actions = {}, onNavigate, assets = fixtureAssets,
  operation = { kind: 'idle', actionId: null, jobId: null, error: null }, record = () => {},
  reconcile = async () => record({ moduleId, action: 'reconcile', args: [] }) }) {
  const defaults = useMemo(() => Object.fromEntries(['generate', 'regenerate', 'select', 'remove', 'submit', 'extractFile', 'image', 'save', 'createVersion', 'markReady', 'requestChanges', 'approve', 'reject', 'reopen', 'build', 'download', 'refine', 'preparePrompts', 'generateAll', 'upload', 'saveBatch', 'prepareReview', 'loadTemplateVersion'].map(name => [name,
    async (...args) => {
      record({ moduleId, action: name, args })
      const result = safeFixtureResult(name, scenario)
      return typeof result === 'function' ? result(...args) : result
    },
  ])), [moduleId, record, scenario])
  const Component = moduleRegistry[moduleId]
  if (!Component) throw new Error(`Module harness not registered: ${moduleId}`)
  const input = projectModuleInput(moduleId, scenario.workspace, scenario)
  const access = deriveWorkflowState(scenario.workspace, scenario.actor, scenario.reviewHistory).modules[moduleId]
  return <WorkflowModuleFrame id={`harness-${moduleId}`} title={access.label}><Suspense fallback={<p role="status">Loading module…</p>}>
    <Component port={{ input, inputKey: moduleInputKey(moduleId, input), access, operation,
      actions: { ...defaults, ...actions }, assets, reconcile, navigate: onNavigate, setDirty: value => record({ moduleId, dirty: value }) }} />
  </Suspense></WorkflowModuleFrame>
}
