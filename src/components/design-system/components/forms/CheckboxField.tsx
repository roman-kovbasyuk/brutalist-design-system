import type { InputHTMLAttributes, ReactNode } from 'react'
import { describedBy, FieldSupport, useFieldId } from './FieldSupport'

export type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'aria-describedby' | 'aria-invalid'> & {
  id?: string
  label: ReactNode
  instructions?: ReactNode
  error?: ReactNode
}

/** A labelled native checkbox. Its whole label is a click target. */
export function CheckboxField({ id: providedId, label, instructions, error, className = '', ...props }: CheckboxFieldProps) {
  const id = useFieldId(providedId)
  return <div className={`ds-choice-field ${className}`.trim()}>
    <label className="ds-choice-field__label" htmlFor={id}>
      <input {...props} id={id} type="checkbox" className="ds-choice-field__control" aria-describedby={describedBy(id, instructions, error)} aria-invalid={error ? true : undefined} />
      <span>{label}</span>
    </label>
    <FieldSupport id={id} instructions={instructions} error={error} />
  </div>
}
