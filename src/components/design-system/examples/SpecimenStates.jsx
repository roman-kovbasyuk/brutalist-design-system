import { useState } from 'react'
import { Surface } from '../basics/layout/index.ts'
import { SwitchField } from '../components/forms/index.ts'
import './specimen-states.css'

/** Catalog configuration only. The demonstrated component owns its states and styles. */
export function SpecimenStates({ title, options = [] }) {
  if (!options.length) return null
  return <Surface tone="canvas" className="ds-specimen-states" role="group" aria-label={`${title} states`}>
    {options.map(({ key, ...props }) => <SwitchField key={key || props.label} {...props} />)}
  </Surface>
}

/** One source for the switches, preview props, and reference text. */
export function useSpecimenStates(definitions) {
  const [values, setValues] = useState(() => Object.fromEntries(
    Object.entries(definitions).map(([key, option]) => [key, option.initial ?? false]),
  ))
  const set = (key, checked) => setValues(current => ({ ...current, [key]: checked }))
  const options = Object.entries(definitions).map(([key, option]) => ({
    key, label: option.label, checked: values[key], onCheckedChange: checked => set(key, checked),
  }))
  const reference = base => [base, ...Object.entries(values).map(([key, value]) => `${key}={${value}}`)].join(' ')
  return { values, options, reference, set }
}
