import type { InputHTMLAttributes, ReactNode } from 'react'
import { describedBy, FieldSupport, useFieldId } from './FieldSupport'

export type SwitchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'role' | 'aria-describedby' | 'aria-invalid' | 'onChange'> & {
  id?: string
  label: ReactNode
  instructions?: ReactNode
  error?: ReactNode
  onCheckedChange?: (checked: boolean) => void
}

/** A native checkbox exposed as a switch, with a full-size visible label. */
export function SwitchField({ id: providedId, label, instructions, error, onCheckedChange, className = '', ...props }: SwitchFieldProps) {
  const id = useFieldId(providedId)
  return <div className={`ds-switch-field ${className}`.trim()}>
    <label className="ds-switch-field__label" htmlFor={id}>
      <input {...props} id={id} type="checkbox" role="switch" className="ds-switch-field__control" aria-describedby={describedBy(id, instructions, error)} aria-invalid={error ? true : undefined} onChange={(event) => onCheckedChange?.(event.currentTarget.checked)} />
      <span className="ds-switch-field__track" aria-hidden="true"><span className="ds-switch-field__thumb" /></span>
      <span>{label}</span>
    </label>
    <FieldSupport id={id} instructions={instructions} error={error} />
  </div>
}
