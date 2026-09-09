import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FeedbackTone } from './StatusBadge'

export type AlertProps = {
  title?: ReactNode
  children?: ReactNode
  tone?: Exclude<FeedbackTone, 'neutral'>
  onDismiss?: () => void
  className?: string
}

/** A persistent inline message for errors, warnings, and useful context. */
export function Alert({ title, children, tone = 'info', onDismiss, className = '' }: AlertProps) {
  const urgent = tone === 'danger'
  return <div className={`ds-alert ${className}`.trim()} data-tone={tone} role={urgent ? 'alert' : 'status'}>
    <div className="ds-alert__content">
      {title && <strong className="ds-alert__title">{title}</strong>}
      {children && <div className="ds-alert__body">{children}</div>}
    </div>
    {onDismiss && <button type="button" className="ds-alert__dismiss" aria-label="Dismiss alert" onClick={onDismiss}><X size={16} aria-hidden="true" /></button>}
  </div>
}
