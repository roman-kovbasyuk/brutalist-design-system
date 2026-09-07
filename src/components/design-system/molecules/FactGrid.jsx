import './fact-grid.css'

/** Responsive labelled facts. Values may be read-only text or shared editors. */
export function FactGrid({ items, label = 'Details' }) {
  return <div className="v2-fact-grid-container"><dl className="v2-fact-grid" aria-label={label}>{items.map(item => <div key={item.id} data-emphasis={item.emphasis || undefined}>
    <dt>{item.label}</dt><dd>{item.heading ? <h2>{item.content}</h2> : item.content}</dd>
  </div>)}</dl></div>
}
