import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export type TabItem = { value: string; label: string; disabled?: boolean }

export type TabsProps = {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  idPrefix?: string
  className?: string
}

function tabIds(prefix: string, value: string, keyForValue: (value: string) => string) {
  const key = `${prefix}-${keyForValue(value)}`
  return { tab: `${key}-tab`, panel: `${key}-panel` }
}

/** Canonical tab interaction. Supply a unique idPrefix for each group and its panels. */
export function Tabs(props: TabsProps) {
  return <TabsPrimitive {...props} />
}

/** Source-only bridge for legacy DOM IDs; selection always uses exact values. */
export function TabsPrimitive({ items, value, onValueChange, ariaLabel, idPrefix = 'tab', className = '', keyForValue = encodeURIComponent }: TabsProps & { keyForValue?: (value: string) => string }) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const enabled = items.filter((item) => !item.disabled)
  const selected = enabled.find((item) => item.value === value) ?? enabled[0]

  function move(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !enabled.length) return
    event.preventDefault()
    const index = enabled.findIndex((item) => item.value === current)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
    const next = enabled[nextIndex].value
    onValueChange(next)
    refs.current.get(next)?.focus()
  }

  return <div className={`v2-pill-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
    {items.map((item) => {
      const ids = tabIds(idPrefix, item.value, keyForValue)
      const active = !item.disabled && item.value === selected?.value
      return <button key={item.value} ref={(element) => { if (element) refs.current.set(item.value, element); else refs.current.delete(item.value) }}
        type="button" role="tab" id={ids.tab} aria-controls={ids.panel} aria-selected={active}
        disabled={item.disabled} tabIndex={active ? 0 : -1}
        onClick={() => onValueChange(item.value)} onKeyDown={(event) => move(event, item.value)}>{item.label}</button>
    })}
  </div>
}

export type TabPanelProps = { value: string; activeValue: string; idPrefix?: string; children: ReactNode; className?: string }

export function TabPanel(props: TabPanelProps) {
  return <TabPanelPrimitive {...props} />
}

export function TabPanelPrimitive({ value, activeValue, idPrefix = 'tab', children, className = '', keyForValue = encodeURIComponent }: TabPanelProps & { keyForValue?: (value: string) => string }) {
  const ids = tabIds(idPrefix, value, keyForValue)
  return <div className={className} role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} hidden={value !== activeValue} tabIndex={0}>{children}</div>
}
