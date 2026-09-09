import type { ReactNode } from 'react'

export type AIResultProps = {
  title: ReactNode
  children?: ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/** A generic result surface; selection and persistence stay with the caller. */
export function AIResult({ title, children, actionLabel, onAction, className = '' }: AIResultProps) {
  return <section className={`ds-ai-result ${className}`.trim()}>
    <div className="ds-ai-result__mark" aria-hidden="true">✦</div>
    <div className="ds-ai-result__content"><h3>{title}</h3>{children && <div>{children}</div>}</div>
    {actionLabel && onAction && <button type="button" className="ds-ai-result__action" onClick={onAction}>{actionLabel}</button>}
  </section>
}
