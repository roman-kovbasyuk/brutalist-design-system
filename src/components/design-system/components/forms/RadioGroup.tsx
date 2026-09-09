import { useId } from 'react'
import type { ReactNode } from 'react'
import { describedBy, FieldSupport, useFieldId } from './FieldSupport'

export type RadioOption = { value: string; label: ReactNode; disabled?: boolean }
export type RadioGroupProps = {
  id?: string
  name?: string
  label: ReactNode
  instructions?: ReactNode
  error?: ReactNode
  options: RadioOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  className?: string
}

/** A native radio group that shares one visible label and support copy. */
export function RadioGroup({ id: providedId, name: providedName, label, instructions, error, options, value, defaultValue, onChange, disabled = false, className = '' }: RadioGroupProps) {
  const id = useFieldId(providedId)
  const generatedName = useId()
  const name = providedName ?? `ds-radio-${generatedName.replace(/:/g, '')}`
  return <fieldset className={`ds-radio-group ${className}`.trim()} aria-describedby={describedBy(id, instructions, error)}>
    <legend className="ds-field__label">{label}</legend>
    <div className="ds-radio-group__options" role="radiogroup" aria-label={typeof label === 'string' ? label : undefined}>
      {options.map((option) => {
        const optionId = `${id}-${option.value}`
        return <label key={option.value} className="ds-choice-field__label" htmlFor={optionId}>
          <input id={optionId} className="ds-choice-field__control" type="radio" name={name} value={option.value} checked={value === undefined ? undefined : value === option.value} defaultChecked={defaultValue === option.value} disabled={disabled || option.disabled} aria-invalid={error ? true : undefined} onChange={() => onChange?.(option.value)} />
          <span>{option.label}</span>
        </label>
      })}
    </div>
    <FieldSupport id={id} instructions={instructions} error={error} />
  </fieldset>
}
