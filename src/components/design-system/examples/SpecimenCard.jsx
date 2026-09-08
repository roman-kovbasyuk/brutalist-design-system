import { cardEntries, PreviewMetadata } from './PreviewMetadata.jsx'

export function SpecimenCard({ title, description, children, className = '', id }) {
  const entry = cardEntries[title]
  return (
    <div id={id} className={`v2-specimen-card ${className}`.trim()}>
      {entry ? <PreviewMetadata name={entry} title={title} description={description} /> : <div className="v2-specimen-card__heading">
        <h3>{title}</h3>

      </div>}
      <div className="v2-specimen-card__body">{children}</div>
    </div>
  )
}
