import type { ReactNode } from 'react'
import { PillTabs } from '../../molecules/PillTabs.jsx'

export type TabItem = { value: string; label: string; disabled?: boolean }

export type TabsProps = {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  idPrefix?: string
  className?: string
}

/** Typed adapter for the established PillTabs control. */
export function Tabs({ items, value, onValueChange, ariaLabel, idPrefix = 'tab', className = '' }: TabsProps) {
  const enabled = items.filter((item) => !item.disabled)
  const labels = enabled.map((item) => item.label)
  const selected = enabled.find((item) => item.value === value) ?? enabled[0]
  if (!selected) return null
  return <div className={className}>
    <PillTabs tabs={labels} value={selected.label} ariaLabel={ariaLabel} idPrefix={idPrefix} onChange={(label: string) => {
      const item = enabled.find((candidate) => candidate.label === label)
      if (item) onValueChange(item.value)
    }} />
  </div>
}

export type TabPanelProps = { value: string; activeValue: string; idPrefix?: string; children: ReactNode; className?: string }

export function TabPanel({ value, activeValue, idPrefix = 'tab', children, className = '' }: TabPanelProps) {
  return <div className={className} role="tabpanel" id={`${idPrefix}-${value}-panel`} aria-labelledby={`${idPrefix}-${value}-tab`} hidden={value !== activeValue} tabIndex={0}>{children}</div>
}
