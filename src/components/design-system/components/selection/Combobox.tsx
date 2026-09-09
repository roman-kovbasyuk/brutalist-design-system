import { useId, useMemo, useState } from 'react'
import type { SelectionControlProps, SelectionValue } from './types'

export type ComboboxProps<T extends SelectionValue> = SelectionControlProps<T> & {
  value: T | null
  onValueChange: (value: T | null) => void
  clearable?: boolean
}

/** A controlled, searchable single-value selection field. */
export function Combobox<T extends SelectionValue>({
  label,
  options,
  value,
  onValueChange,
  clearable = false,
  disabled = false,
  placeholder = 'Search options',
  className = '',
}: ComboboxProps<T>) {
  const listboxId = useId()
  const selected = options.find((option) => option.value === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleOptions = useMemo(() => options.filter((option) => String(option.label).toLocaleLowerCase().includes(normalizedQuery)), [options, normalizedQuery])
  const inputValue = open ? query : selected ? String(selected.label) : ''

  function choose(nextValue: T, isDisabled?: boolean) {
    if (isDisabled || disabled) return
    onValueChange(nextValue)
    setQuery('')
    setOpen(false)
  }

  return <div className={`ds-selection ${className}`.trim()}>
    <label className="ds-selection__label" htmlFor={listboxId}>{label}</label>
    <div className="ds-selection__control-wrap">
      <input
        id={listboxId}
        className="ds-selection__control"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={`${listboxId}-options`}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        placeholder={placeholder}
        value={inputValue}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); setQuery('') }
          if (event.key === 'Enter' && visibleOptions.length === 1) { event.preventDefault(); choose(visibleOptions[0].value, visibleOptions[0].disabled) }
        }}
      />
      {clearable && value !== null && !disabled && <button className="ds-selection__clear" type="button" aria-label={`Clear ${label}`} onClick={() => { onValueChange(null); setQuery('') }}>×</button>}
    </div>
    {open && <ul id={`${listboxId}-options`} className="ds-selection__options" role="listbox" aria-label={`${label} options`}>
      {visibleOptions.length > 0 ? visibleOptions.map((option) => <li key={String(option.value)}>
        <button
          type="button"
          className="ds-selection__option"
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          disabled={option.disabled || disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(option.value, option.disabled)}
        >{option.label}</button>
      </li>) : <li className="ds-selection__empty" role="status">No matching options.</li>}
    </ul>}
  </div>
}
