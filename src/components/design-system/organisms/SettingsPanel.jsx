import { useId } from 'react'
import './settings-panel.css'

/** Settings composition extracted from UI blocks; caller owns values and persistence. */
export function SettingsPanel({ title, description, titleId, as: Element = 'section', children, footer, ...props }) {
  const id = useId()
  const headingId = titleId ?? id
  const className = ['v2-settings-panel', 'v2-settings-block', props.className].filter(Boolean).join(' ')
  return <Element {...props} className={className} aria-labelledby={headingId}>
    <header className="v2-settings-panel__intro"><h2 id={headingId}>{title}</h2></header>
    {children}
    {footer}
  </Element>
}

export function SettingsRow({ label, description, children, compact = false, className = '' }) {
  return <div className={['v2-settings-row', className].filter(Boolean).join(' ')} data-compact={compact || undefined}>
    <div className="v2-settings-row__description"><strong>{label}</strong></div>
    <div className="v2-settings-row__control">{children}</div>
  </div>
}

export function SettingsFooter({ children, message, error = false }) {
  return <footer className="v2-settings-footer">
    {message && <p className="v2-settings-feedback" role={error ? 'alert' : 'status'} data-error={error || undefined}>{message}</p>}
    {children && <div className="v2-settings-actions">{children}</div>}
  </footer>
}
