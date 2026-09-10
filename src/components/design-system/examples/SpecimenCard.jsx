import { cardEntries, PreviewMetadata } from './PreviewMetadata.jsx'
import { componentGroups } from './component-groups.js'
import { TokenCopyTarget } from '../atoms/TokenCopyTarget.jsx'

export function SpecimenCard({ title, description, children, className = '', id, copyValue = `${title} — component group` }) {
  const entry = cardEntries[title]
  const group = componentGroups.find(group => group.name === title)
  return (
    <TokenCopyTarget surface component copyValue={copyValue} label={title} id={id || group?.id} style={{ order: componentGroups.findIndex(group => group.name === title) }} className={`v2-specimen-card ${className}`.trim()}>
      {entry ? <PreviewMetadata name={entry} title={title} description={description} copyId={group?.id} /> : <div className="v2-specimen-card__heading">
        <h3>{group ? <TokenCopyTarget component copyValue={copyValue} label={`${title} group`} inline>{title}</TokenCopyTarget> : title}</h3>

      </div>}
      <div className="v2-specimen-card__body">{children}</div>
    </TokenCopyTarget>
  )
}
