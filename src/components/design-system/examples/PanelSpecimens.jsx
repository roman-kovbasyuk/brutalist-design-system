import { Panel } from '../components/content/Panel.tsx'
import { SpecimenCard } from './SpecimenCard.jsx'

export function PanelSpecimens() {
  return (
    <SpecimenCard
      title="Panel"
      description="A neutral wrapper for grouped content with a header, optional subheader, and content slot."
      copyValue="Panel — wrapper, header, subheader, content"
    >
      <Panel
        title="Campaign brief"
        description="Shared grouping structure for related controls and information."
        data-component-reference="Panel — header, subheader, content slot"
      />
    </SpecimenCard>
  )
}
