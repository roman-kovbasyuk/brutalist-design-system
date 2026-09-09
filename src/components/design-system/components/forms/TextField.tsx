import type { InputHTMLAttributes, ReactNode } from 'react'
import { describedBy, FieldSupport, useFieldId } from './FieldSupport'

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-describedby' | 'aria-invalid'> & {
  id?: string
  label: ReactNode
  instructions?: ReactNode
  error?: ReactNode
}

/** A labelled native text input with canonical helper and error wiring. */
export function TextField({ id: providedId, label, instructions, error, className = '', ...props }: TextFieldProps) {
  const id = useFieldId(providedId)
  return <div className={`ds-field ${className}`.trim()}>
    <label className="ds-field__label" htmlFor={id}>{label}</label>
    <input {...props} id={id} className="ds-field__control" aria-describedby={describedBy(id, instructions, error)} aria-invalid={error ? true : undefined} />
    <FieldSupport id={id} instructions={instructions} error={error} />
  </div>
}
