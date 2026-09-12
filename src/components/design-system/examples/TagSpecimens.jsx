import { Tag } from '../components/content/Tag.tsx'
import { TagButton } from '../components/content/TagButton.tsx'
import { SpecimenCard } from './SpecimenCard.jsx'
import { CircleAlert, CircleCheck, Clock3 } from 'lucide-react'
import { useSpecimenStates } from './SpecimenStates.jsx'

function TagCell({ label, children }) {
  return <div className="v2-tag-cell">
    <span className="v2-demo-label">{label}</span>
    <div className="v2-tag-list">{children}</div>
  </div>
}

function Sample({ state, tone = 'neutral', variant = 'filled', icon: Icon, children }) {
  const selectedVariant = state.outline ? 'outline' : variant
  return <Tag tone={tone} variant={selectedVariant} data-component-reference={`Tag variant="${selectedVariant}" tone="${tone}" icons={${Boolean(Icon && state.icons)}} (.ds-tag .ds-tag--${selectedVariant} .ds-tag--${tone})`}>
    {Icon && state.icons && <Icon aria-hidden="true" size={15} />}{children}
  </Tag>
}

export function TagSpecimens() {
  const state = useSpecimenStates({ outline: { label: 'Outline' }, icons: { label: 'Icons', initial: true } })
  return <SpecimenCard
    title="Tags"
    states={state.options} copyValue={state.reference('Tags — component group')}
    description="Compact labels for categories, filters, and color-coded status."
  >
    <div className="v2-tag-grid">
      <TagCell label="Color">
        <Sample state={state.values}>Default</Sample>
        <Sample state={state.values} tone="accent">Paid social</Sample>
        <Sample state={state.values} tone="success">Approved</Sample>
      </TagCell>
      <TagCell label="Status">
        <Sample state={state.values} tone="success" icon={CircleCheck}>Ready</Sample>
        <Sample state={state.values} tone="warning" icon={Clock3}>Review due</Sample>
        <Sample state={state.values} tone="danger" icon={CircleAlert}>Blocked</Sample>
      </TagCell>
      <TagCell label="Filter">
        <TagButton dismissible tone="accent" aria-label="Remove Email filter" data-component-reference='TagButton dismissible tone="accent"'>Email</TagButton>
      </TagCell>
    </div>
  </SpecimenCard>
}
