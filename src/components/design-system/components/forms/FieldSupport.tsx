import { useId } from 'react'
import type { ReactNode } from 'react'

type FieldSupportProps = {
  id: string
  instructions?: ReactNode
  error?: ReactNode
}

export type FieldMeta = {
  id?: string
  instructions?: ReactNode
  error?: ReactNode
}

export function useFieldId(providedId?: string) {
  const generatedId = useId()
  return providedId ?? `ds-field-${generatedId.replace(/:/g, '')}`
}

export function describedBy(id: string, instructions?: ReactNode, error?: ReactNode) {
  const ids = [instructions ? `${id}-instructions` : undefined, error ? `${id}-error` : undefined].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export function FieldSupport({ id, instructions, error }: FieldSupportProps) {
  return <>
    {instructions && <p id={`${id}-instructions`} className="ds-field__instructions">{instructions}</p>}
    {error && <p id={`${id}-error`} className="ds-field__error" role="alert">{error}</p>}
  </>
}
