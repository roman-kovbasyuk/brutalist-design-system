import './pill-tabs.css'
import { TabsPrimitive, TabPanelPrimitive } from '../components/navigation/Tabs'

const legacyKey = (label) => label.toLowerCase().replace(/\s+/g, '-')

/** Compatibility adapter for the original label-based API and slug IDs. */
export function PillTabs({ tabs, value, onChange, ariaLabel, idPrefix = 'tab' }) {
  const items = tabs.map((label) => ({ value: label, label }))
  return <TabsPrimitive items={items} value={value} ariaLabel={ariaLabel} idPrefix={idPrefix}
    keyForValue={legacyKey} onValueChange={onChange} />
}

/** Pair every tab with a panel using the same stable, unique idPrefix. */
export function PillTabPanel({ tab, value, idPrefix = 'tab', children, className = '' }) {
  return <TabPanelPrimitive value={tab} activeValue={value} idPrefix={idPrefix} keyForValue={legacyKey} className={className}>{children}</TabPanelPrimitive>
}
