import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef } from 'react'
import { describedBy, FieldSupport, useFieldId } from './FieldSupport'

export type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'aria-describedby' | 'aria-invalid'> & {
  id?: string
  label: ReactNode
  instructions?: ReactNode
  error?: ReactNode
  indeterminate?: boolean
  ref?: Ref<HTMLInputElement>
}

/** A labelled native checkbox. Its whole label is a click target. */
export function CheckboxField({ id: providedId, label, instructions, error, indeterminate = false, ref, className = '', ...props }: CheckboxFieldProps) {
  const id = useFieldId(providedId)
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => input.current!, [])
  useEffect(() => { if (input.current) input.current.indeterminate = indeterminate }, [indeterminate])
  return <div className={`ds-choice-field ${className}`.trim()} data-mixed={indeterminate || undefined}>
    <label className="ds-choice-field__label" htmlFor={id}>
      <input {...props} ref={input} id={id} type="checkbox" aria-checked={indeterminate ? 'mixed' : undefined} className="ds-choice-field__control" aria-describedby={describedBy(id, instructions, error)} aria-invalid={error ? true : undefined} />
      <span>{label}</span>
    </label>
    <FieldSupport id={id} instructions={instructions} error={error} />
  </div>
}
