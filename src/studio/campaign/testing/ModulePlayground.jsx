import { useMemo, useState } from 'react'
import { AppButton } from '../../../components/design-system/atoms/AppButton.jsx'
import { SelectMenu } from '../../../components/design-system/molecules/SelectMenu.jsx'
import { MODULE_IDS, moduleInputKey, projectModuleInput } from '../moduleContracts.js'
import { deriveWorkflowState } from '../workflowState.js'
import { ModuleHarness } from './ModuleHarness.jsx'
import snapshots from './modulePlaygroundFixtures.json'
import { parseModulePlaygroundRoute, PLAYGROUND_SCENARIOS } from './modulePlaygroundRoute.js'
import './module-playground.css'

const roles = ['marketer', 'designer', 'admin']
const operationKinds = ['idle', 'running', 'failed', 'uncertain']
const operationActions = Object.freeze({
  brief: 'analyze', copy: 'generate', visuals: 'prepare-prompts', banners: 'save-batch',
  review: 'prepare-review', distribute: 'build',
})

function actorFor(role) {
  return role === 'designer'
    ? { id: 'designer-1', role, displayName: 'Fixture Designer', email: 'designer@example.test' }
    : { id: `${role}-1`, role, displayName: `Fixture ${role}`, email: `${role}@example.test` }
}

function operationFor(moduleId, kind) {
  return { kind, actionId: kind === 'idle' ? null : operationActions[moduleId], jobId: kind === 'idle' ? null : 'fixture-job',
    requestId: kind === 'idle' ? null : 'fixture-request',
    error: ['failed', 'uncertain'].includes(kind) ? { message: `Fixture ${kind} operation.` } : null }
}

export function ModulePlayground() {
  const initial = parseModulePlaygroundRoute(new URL(location.href)) ?? { moduleId: 'brief', scenario: 'draft' }
  const [moduleId, setModuleId] = useState(initial.moduleId)
  const [scenarioName, setScenarioName] = useState(initial.scenario)
  const [role, setRole] = useState('marketer')
  const [operationKind, setOperationKind] = useState('idle')
  const [events, setEvents] = useState([])
  const scenario = useMemo(() => ({ ...structuredClone(snapshots[scenarioName]), actor: actorFor(role) }), [scenarioName, role])
  const operation = operationFor(moduleId, operationKind)
  const input = projectModuleInput(moduleId, scenario.workspace, scenario)
  const inputKey = moduleInputKey(moduleId, input)
  const access = deriveWorkflowState(scenario.workspace, scenario.actor, scenario.reviewHistory).modules[moduleId]
  const record = event => setEvents(current => [...current, { fixture: true, ...event }])

  function chooseModule(value) {
    setModuleId(value)
    history.replaceState({}, '', `/mvp/dev/modules/${value}?scenario=${scenarioName}`)
  }
  function chooseScenario(value) {
    setScenarioName(value)
    history.replaceState({}, '', `/mvp/dev/modules/${moduleId}?scenario=${value}`)
  }

  return <main className="module-playground">
    <header className="module-playground__header">
      <div><p className="module-playground__eyebrow">Development-only module playground</p>
        <h1>Fixture records — never production data</h1></div>
      <AppButton onClick={() => setEvents([])} disabled={!events.length}>Clear event log</AppButton>
    </header>
    <section className="module-playground__controls" aria-label="Fixture controls">
      <SelectMenu label="Module" triggerLabel={`Fixture module: ${moduleId}`} value={moduleId} options={MODULE_IDS} onChange={chooseModule} />
      <SelectMenu label="Scenario" triggerLabel={`Fixture scenario: ${scenarioName}`} value={scenarioName} options={PLAYGROUND_SCENARIOS} onChange={chooseScenario} />
      <SelectMenu label="Role" triggerLabel={`Fixture role: ${role}`} value={role} options={roles} onChange={setRole} />
      <SelectMenu label="Operation state" triggerLabel={`Operation state: ${operationKind}`} value={operationKind} options={operationKinds} onChange={setOperationKind} />
    </section>
    <section className="module-playground__diagnostics" role="region" aria-label="Fixture diagnostics">
      <dl>
        <div><dt>Module</dt><dd>{moduleId}</dd></div><div><dt>Input key</dt><dd>{inputKey}</dd></div>
        <div><dt>Dependency</dt><dd>{access.canVisit ? 'available' : 'blocked'}</dd></div>
        <div><dt>Access</dt><dd>{access.canEdit ? 'editable' : access.reason}</dd></div>
        <div><dt>Operation</dt><dd>{operation.kind}</dd></div><div><dt>Action</dt><dd>{operation.actionId ?? '—'}</dd></div>
        <div><dt>Job</dt><dd>{operation.jobId ?? '—'}</dd></div><div><dt>Request</dt><dd>{operation.requestId ?? '—'}</dd></div>
      </dl>
    </section>
    <ModuleHarness key={`${moduleId}:${scenarioName}:${role}`} moduleId={moduleId} scenario={scenario} operation={operation}
      record={record} onNavigate={target => record({ moduleId, navigate: target })} />
    <section className="module-playground__events"><h2>Fixture event log</h2>
      <ol role="log" aria-label="Fixture event log">{events.map((event, index) => <li key={index}><code>{JSON.stringify(event)}</code></li>)}</ol>
    </section>
  </main>
}

export default ModulePlayground
