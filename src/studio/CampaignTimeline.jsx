import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { StepRail } from '../components/StepRail.jsx'
import { currentStage, stages } from './workflow.js'

const items = stages.map(label => [label])

export function CampaignTimeline({ workspace, stage, pending, onChange }) {
  const [expanded, setExpanded] = useState(false)
  return <aside className="bs-campaign-timeline" data-expanded={expanded} aria-label="Campaign progress">
    <button type="button" className="bs-timeline-toggle" aria-expanded={expanded} aria-controls="campaign-timeline-steps" onClick={() => setExpanded(value => !value)}>
      <span>Step {stage + 1} of {stages.length} · {stages[stage]}</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    <div id="campaign-timeline-steps">
      <StepRail items={items} hiddenSteps={[]} currentStep={stage + 1} maxStep={currentStage(workspace) + 1} disabled={Boolean(pending)} scrollOnChange={false} anchor ariaLabel="Campaign workflow" className="bs-timeline-rail" onStepChange={number => { onChange(number - 1); setExpanded(false) }} />
    </div>
  </aside>
}
