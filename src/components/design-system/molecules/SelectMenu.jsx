import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import './select-menu.css'

/**
 * @typedef {{
 *   label: string,
 *   value: string,
 *   options: (string | { label: string, icon?: import('react').ComponentType<{ size?: number, 'aria-hidden'?: string }>, value?: string })[],
 *   onChange: (value: string) => void,
 *   triggerLabel?: string,
 *   triggerId?: string,
 *   describedBy?: string,
 *   disabled?: boolean,
 * }} SelectMenuProps
 */

/** Small, single-selection lists. For native form submission prefer a native select. */
/** @param {SelectMenuProps} props */
export function SelectMenu({ label, value, options, onChange, triggerLabel, triggerId, describedBy, disabled = false, showOptionIcons = true }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  const id = useId()
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => {
    if (!open) return
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    const selected = root.current?.querySelector('[aria-selected="true"]') ?? root.current?.querySelector('[role="option"]')
    selected?.focus()
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const normalizedOptions = options.map((option) => typeof option === 'string' ? { label: option, value: option } : { value: option.value ?? option.label, ...option })
  return <div className="v2-menu-select" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button id={triggerId} disabled={disabled} ref={trigger} className="v2-select-trigger v2-interactive-control" type="button" aria-label={triggerLabel || `${label}: ${value}`} aria-describedby={describedBy} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={(event) => {
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
    }}>{normalizedOptions.map((option) => { const Icon = option.icon; const selected = value === option.value; return <button key={option.value} type="button" role="option" aria-selected={selected} tabIndex={selected ? 0 : -1} className="v2-listbox-option v2-interactive-control" onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus() }}><span className="v2-listbox-option__label">{showOptionIcons && Icon && <Icon size={16} aria-hidden="true" />}{option.label}</span>{selected && <Check size={16} aria-hidden="true" />}</button> })}</div>}
  </div>
}
