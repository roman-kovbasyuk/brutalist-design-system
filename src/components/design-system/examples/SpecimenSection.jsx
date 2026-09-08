import { PreviewMetadata, sectionEntries } from './PreviewMetadata.jsx'

export function SpecimenSection({ index, title, description, children, className = '' }) {
  return (
    <section className={`v2-section ${className}`.trim()} aria-labelledby={`v2-section-${index}`}>
      <header className="v2-section__header">
        <span>{String(index).padStart(2, '0')}</span>
        <div>
          <h2 id={`v2-section-${index}`}>{title}</h2>

        </div>
        {sectionEntries[index] && <PreviewMetadata name={sectionEntries[index]} compact />}
      </header>
      <div className="v2-section__body">
        {children}
      </div>
    </section>
  )
}
