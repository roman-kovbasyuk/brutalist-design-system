import { useId } from 'react'
import './media-workflow-card.css'

/** Labelled result with ordered content columns; callers own media and actions. */
export function MediaWorkflowCard({ title, context, status, columns, selected = false }) {
  const id = useId()
  return <article className="v2-media-workflow-card" aria-labelledby={id} data-selected={selected}>
    <header className="v2-media-workflow-card__heading">
      <div><h3 id={id}>{title}</h3>{context && <div className="v2-media-workflow-card__context">{context}</div>}</div>{status}
    </header>
    <div className="v2-media-workflow-card__columns">{columns.map(column => <section key={column.id} className="v2-media-workflow-card__column" aria-labelledby={`${id}-${column.id}`}>
      <h4 id={`${id}-${column.id}`}>{column.label}</h4>
      <div className="v2-media-workflow-card__body">{column.content}</div>
      {column.actions && <div className="v2-media-workflow-card__actions">{column.actions}</div>}
    </section>)}</div>
  </article>
}
