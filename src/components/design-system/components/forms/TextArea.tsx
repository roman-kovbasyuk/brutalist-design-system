import type { ReactNode, TextareaHTMLAttributes } from 'react'
import { describedBy, FieldSupport, useFieldId } from './FieldSupport'

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'aria-describedby' | 'aria-invalid'> & {
  id?: string
  label: ReactNode
  instructions?: ReactNode
  error?: ReactNode
}

/** A labelled native multiline text control with canonical helper and error wiring. */
export function TextArea({ id: providedId, label, instructions, error, className = '', ...props }: TextAreaProps) {
  const id = useFieldId(providedId)
  return <div className={`ds-field ${className}`.trim()}>
    <label className="ds-field__label" htmlFor={id}>{label}</label>
    <textarea {...props} id={id} className="ds-field__control ds-field__control--textarea" aria-describedby={describedBy(id, instructions, error)} aria-invalid={error ? true : undefined} />
    <FieldSupport id={id} instructions={instructions} error={error} />
  </div>
}
