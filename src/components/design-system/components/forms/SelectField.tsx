import type { ReactNode, SelectHTMLAttributes } from 'react'
import { describedBy, FieldSupport, useFieldId } from './FieldSupport'

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean }
export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'aria-describedby' | 'aria-invalid' | 'children'> & {
  id?: string
  label: ReactNode
  instructions?: ReactNode
  error?: ReactNode
  options: SelectOption[]
}

/** A native select with an explicit options array, label, and support copy. */
export function SelectField({ id: providedId, label, instructions, error, options, className = '', ...props }: SelectFieldProps) {
  const id = useFieldId(providedId)
  return <div className={`ds-field ${className}`.trim()}>
    <label className="ds-field__label" htmlFor={id}>{label}</label>
    <select {...props} id={id} className="ds-field__control" aria-describedby={describedBy(id, instructions, error)} aria-invalid={error ? true : undefined}>
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    <FieldSupport id={id} instructions={instructions} error={error} />
  </div>
}
