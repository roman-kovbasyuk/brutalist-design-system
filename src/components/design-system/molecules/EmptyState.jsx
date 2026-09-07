import '../action-card.css'

/** Compact module guidance; the icon is decorative and content stays readable. */
export function EmptyState({ icon, children }) {
  return <div className="v2-empty-state"><span aria-hidden="true">{icon}</span><p>{children}</p></div>
}
