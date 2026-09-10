import type { HTMLAttributes, ReactNode } from 'react'

export type ActionCardProps = HTMLAttributes<HTMLElement> & {
  /** A short label that identifies the card to assistive technology. */
  label: string
  status?: ReactNode
  actions?: ReactNode
  persistentAction?: ReactNode
  highlighted?: boolean
  dismissing?: boolean
  exiting?: boolean
  children: ReactNode
}

/** A neutral content surface with optional persistent and revealed actions. */
export function ActionCard({
  label,
  status,
  actions,
  persistentAction,
  highlighted = false,
  dismissing = false,
  exiting = false,
  children,
  className = '',
  ...props
}: ActionCardProps) {
  return <article {...props} aria-label={props['aria-label'] ?? label}
    className={`ds-action-card ${className}`.trim()} data-highlighted={highlighted || undefined}
    data-dismissing={dismissing || undefined} data-exiting={exiting || undefined}
    aria-hidden={exiting || props['aria-hidden']} inert={exiting || props.inert}>
    <header className="ds-action-card__header">
      <div className="ds-action-card__meta"><span>{label}</span>{status}</div>
      {(actions || persistentAction) && <div className="ds-action-card__controls">
        {actions && <div className="ds-action-card__actions">{actions}</div>}
        {persistentAction}
      </div>}
    </header>
    <div className="ds-action-card__content">{children}</div>
  </article>
}
