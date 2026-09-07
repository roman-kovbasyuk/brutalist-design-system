import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import './select-menu.css'

/** Small, single-selection lists. For native form submission prefer a native select. */
export function SelectMenu({ label, value, options, onChange, triggerLabel, triggerId, disabled = false }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    root.current?.querySelector('[aria-selected="true"]')?.focus()
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return <div className="v2-menu-select" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button id={triggerId} disabled={disabled} ref={trigger} className="v2-select-trigger v2-interactive-control" type="button" aria-label={triggerLabel || `${label}: ${value}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={(event) => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true) }
    }}>{value}<ChevronDown size={16} aria-hidden="true" /></button>
    {open && <div id={id} role="listbox" aria-label={label} className="v2-floating-listbox" onKeyDown={(event) => {
      const items = [...event.currentTarget.querySelectorAll('[role="option"]')]
      const current = items.indexOf(document.activeElement)
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }
    }}>{options.map((option) => <button key={option} type="button" role="option" aria-selected={value === option} tabIndex={value === option ? 0 : -1} className="v2-listbox-option v2-interactive-control" onClick={() => { onChange(option); setOpen(false); trigger.current?.focus() }}>{option}{value === option && <Check size={16} aria-hidden="true" />}</button>)}</div>}
  </div>
}
