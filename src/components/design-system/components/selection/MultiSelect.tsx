import { useId, useMemo, useState } from 'react'
import type { SelectionControlProps, SelectionValue } from './types'

export type MultiSelectProps<T extends SelectionValue> = SelectionControlProps<T> & {
  value: readonly T[]
  onValueChange: (value: T[]) => void
}

/** A controlled, searchable multi-value selection field. */
export function MultiSelect<T extends SelectionValue>({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Search options',
  className = '',
}: MultiSelectProps<T>) {
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleOptions = useMemo(() => options.filter((option) => String(option.label).toLocaleLowerCase().includes(normalizedQuery)), [options, normalizedQuery])
  const selectedLabels = options.filter((option) => value.includes(option.value)).map((option) => String(option.label))

  function toggle(nextValue: T, isDisabled?: boolean) {
    if (isDisabled || disabled) return
    onValueChange(value.includes(nextValue) ? value.filter((item) => item !== nextValue) : [...value, nextValue])
  }

  return <div className={`ds-selection ${className}`.trim()}>
    <label className="ds-selection__label" htmlFor={inputId}>{label}</label>
    <input
      id={inputId}
      className="ds-selection__control"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-controls={`${inputId}-options`}
      aria-expanded={open}
      aria-haspopup="listbox"
      disabled={disabled}
      placeholder={selectedLabels.length ? selectedLabels.join(', ') : placeholder}
      value={query}
      onFocus={() => setOpen(true)}
      onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
      onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); setQuery('') } }}
    />
    {open && <ul id={`${inputId}-options`} className="ds-selection__options" role="listbox" aria-label={`${label} options`} aria-multiselectable="true">
      {visibleOptions.length > 0 ? visibleOptions.map((option) => <li key={String(option.value)}>
        <button
          type="button"
          className="ds-selection__option"
          role="option"
          aria-selected={value.includes(option.value)}
          aria-disabled={option.disabled || undefined}
          disabled={option.disabled || disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggle(option.value, option.disabled)}
        >{option.label}</button>
      </li>) : <li className="ds-selection__empty" role="status">No matching options.</li>}
    </ul>}
  </div>
}
