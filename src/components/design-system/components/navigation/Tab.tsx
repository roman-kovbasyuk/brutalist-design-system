import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export type TabItem = { value: string; label: string; disabled?: boolean }

export type TabProps = {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  /** Share this prefix with the panels; use a unique prefix for each group. */
  idPrefix?: string
  className?: string
}

function tabId(prefix: string, value: string) {
  return `${prefix}-${encodeURIComponent(value)}-tab`
}

function panelId(prefix: string, value: string) {
  return `${prefix}-${encodeURIComponent(value)}-panel`
}

/** A horizontal pill tablist with controlled selection and automatic activation. */
export function Tab({ items, value, onValueChange, ariaLabel, idPrefix = 'tab', className = '' }: TabProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const enabled = items.filter(item => !item.disabled)
  const focusValue = enabled.find(item => item.value === value)?.value ?? enabled[0]?.value

  function move(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key) || !enabled.length) return
    event.preventDefault()
    const index = enabled.findIndex(item => item.value === current)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
    const next = enabled[nextIndex].value
    onValueChange(next)
    refs.current.get(next)?.focus()
  }

  if (!items.length) return null
  return <div className={`v2-pill-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel} aria-orientation="horizontal">
    {items.map(item => <button
      key={item.value}
      ref={element => { if (element) refs.current.set(item.value, element); else refs.current.delete(item.value) }}
      id={tabId(idPrefix, item.value)}
      type="button"
      role="tab"
      disabled={item.disabled}
      aria-selected={item.value === value}
      aria-controls={panelId(idPrefix, item.value)}
      tabIndex={item.value === focusValue ? 0 : -1}
      onClick={() => onValueChange(item.value)}
      onKeyDown={event => move(event, item.value)}
    >{item.label}</button>)}
  </div>
}

export type TabPanelProps = { value: string; activeValue: string; idPrefix?: string; children: ReactNode; className?: string }

/** Keep one panel mounted for every item, using the same value and idPrefix. */
export function TabPanel({ value, activeValue, idPrefix = 'tab', children, className = '' }: TabPanelProps) {
  return <div className={className} role="tabpanel" id={panelId(idPrefix, value)} aria-labelledby={tabId(idPrefix, value)} hidden={value !== activeValue} tabIndex={0}>{children}</div>
}
