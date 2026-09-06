import './pill-tabs.css'
import { useRef } from 'react'

/**
 * Canonical application tab control. Use this for page-level tabs instead of
 * creating one-off tab markup so keyboard behavior and visual treatment stay
 * consistent with the application design system.
 */
export function PillTabs({ tabs, value, onChange, ariaLabel, idPrefix = 'tab' }) {
  const tabRefs = useRef({})

  function moveTab(event, tab) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = tabs.indexOf(tab)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]
    onChange(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  return (
    <div className="v2-pill-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = tab === value
        const key = tab.toLowerCase().replace(/\s+/g, '-')
        const id = `${idPrefix}-${key}-tab`
        const panelId = `${idPrefix}-${key}-panel`
        return (
          <button
            key={tab}
            ref={(element) => { tabRefs.current[tab] = element }}
            id={id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => moveTab(event, tab)}
          >
            {tab}
          </button>
        )
      })}
    </div>
  )
}

/** Pair every tab with a panel using the same stable, unique idPrefix. */
export function PillTabPanel({ tab, value, idPrefix = 'tab', children, className }) {
  const key = tab.toLowerCase().replace(/\s+/g, '-')
  return <div role="tabpanel" id={`${idPrefix}-${key}-panel`} aria-labelledby={`${idPrefix}-${key}-tab`}
    hidden={value !== tab} tabIndex={0} className={className}>{children}</div>
}
