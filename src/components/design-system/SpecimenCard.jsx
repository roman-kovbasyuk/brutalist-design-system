export function SpecimenCard({ title, description, children, className = '' }) {
  return (
    <div className={`v2-specimen-card ${className}`.trim()}>
      <div className="v2-specimen-card__heading">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="v2-specimen-card__body">{children}</div>
    </div>
  )
}
