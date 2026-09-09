import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppButton } from '../actions/AppButton'

export type ErrorStateProps = {
  title: ReactNode
  description?: ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/** A contained recovery state for a failed section or empty content region. */
export function ErrorState({ title, description, actionLabel, onAction, className = '' }: ErrorStateProps) {
  return <section className={`ds-error-state ${className}`.trim()} aria-labelledby="ds-error-state-title">
    <TriangleAlert className="ds-error-state__icon" aria-hidden="true" />
    <h2 id="ds-error-state-title" className="ds-error-state__title">{title}</h2>
    {description && <p className="ds-error-state__description">{description}</p>}
    {actionLabel && onAction && <AppButton variant="secondary" onClick={onAction}>{actionLabel}</AppButton>}
  </section>
}
