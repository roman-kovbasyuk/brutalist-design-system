import '../action-card.css'

/** Content surface with a persistent action and hover/focus/touch actions.
 * Slots contain application content; this component owns no domain state.
 */
export function ActionCard({ label, status, actions, persistentAction, highlighted = false, dismissing = false, exiting = false, children, ...props }) {
  return <article {...props} className="v2-action-card" data-highlighted={highlighted} data-dismissing={dismissing}
    data-exiting={exiting} aria-hidden={exiting || undefined} inert={exiting || undefined}>
    <header className="v2-action-card__header"><div className="v2-action-card__meta"><span>{label}</span>{status}</div>
      <div className="v2-action-card__controls">
        <div className="v2-action-card__hover-actions">{actions}</div>{persistentAction}
      </div>
    </header>
    <div className="v2-action-card__content">{children}</div>
  </article>
}
