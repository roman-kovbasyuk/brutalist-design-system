import { useState } from 'react'
import { InlineText } from '../components/content/InlineText.tsx'
import { SpecimenCard } from './SpecimenCard.jsx'
import { SpecimenGrid } from './SpecimenGrid.jsx'

const samples = [
  { id: 'h2', label: 'Campaign title', value: 'Nordic spring launch', style: { font: 'var(--v2-weight-heading) var(--v2-text-h2) / var(--v2-line-h2) var(--v2-font)' } },
  { id: 'h4', label: 'Section heading', value: 'Creative direction', style: { font: 'var(--v2-weight-heading-strong) var(--v2-text-h4) / var(--v2-line-h4) var(--v2-font)' } },
  { id: 'h6', label: 'Component heading', value: 'Audience summary', style: { font: 'var(--v2-weight-heading-strong) var(--v2-text-h6) / var(--v2-line-h6) var(--v2-font)' } },
  { id: 'body', label: 'Body copy', value: 'We mitigate it by defining the strict design system documentation, design harness, reusable templates.', style: { font: 'var(--v2-weight-heading) var(--v2-text-body) / var(--v2-line-body) var(--v2-font)' } },
]

export function InlineTextSpecimens() {
  const [values, setValues] = useState(() => Object.fromEntries(samples.map(sample => [sample.id, sample.value])))
  return <SpecimenCard
    title="Text with inline editing"
    description="Edit text in place with a small hover affordance, while preserving the selected Basics typography style."
    copyValue="InlineText — Basics typography variants"
  >
    <SpecimenGrid className="v2-inline-text-grid">
      {samples.map(sample => <div key={sample.id} className="v2-inline-text-sample" data-component-reference={`InlineText typography=${sample.id}`}>
        <span className="v2-demo-label">{sample.label}</span>
        <InlineText
          label={sample.label}
          value={values[sample.id]}
          onSave={next => setValues(current => ({ ...current, [sample.id]: next }))}
          style={sample.style}
        />
      </div>)}
    </SpecimenGrid>
  </SpecimenCard>
}
