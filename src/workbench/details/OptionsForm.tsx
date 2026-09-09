import { SelectField, SwitchField, TextField } from '../../components/design-system'
import type { Control, Value, Values } from '../registry/types'

export type OptionsFormProps = {
  controls: Control[]
  options: Values
  draft: Values
  onOptionsChange: (patch: Values) => void
  onDraftChange: (patch: Values) => void
}

function isAllowed(control: Control, value: Value | undefined) {
  if (control.type === 'boolean') return typeof value === 'boolean'
  if (control.type === 'select') return typeof value === 'string' && control.choices.includes(value)
  return typeof value === 'string'
}

/** Renders only documented controls and refuses invalid values before state reaches a specimen. */
export function OptionsForm({ controls, options, draft, onOptionsChange, onDraftChange }: OptionsFormProps) {
  if (controls.length === 0) return <p className="ds-example-details__empty">This example has no adjustable options.</p>

  return <div className="ds-example-details__options">
    {controls.map((control) => {
      const value = control.type === 'text' ? draft[control.key] : options[control.key]
      if (!isAllowed(control, value)) return null
      if (control.type === 'boolean') return <SwitchField key={control.key} label={control.label} checked={Boolean(value)} onCheckedChange={(checked) => onOptionsChange({ [control.key]: checked })} />
      if (control.type === 'select') return <SelectField key={control.key} label={control.label} value={String(value)} options={control.choices.map((choice) => ({ value: choice, label: choice }))} onChange={(event) => {
        const next = event.currentTarget.value
        if (control.choices.includes(next)) onOptionsChange({ [control.key]: next })
      }} />
      return <TextField key={control.key} label={control.label} value={String(value)} maxLength={control.maxLength} onChange={(event) => onDraftChange({ [control.key]: event.currentTarget.value.slice(0, control.maxLength) })} />
    })}
  </div>
}
