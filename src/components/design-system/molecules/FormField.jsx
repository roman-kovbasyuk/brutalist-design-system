import { useId } from 'react'
import './form-field.css'

/**
 * @typedef {{ id: string, describedBy?: string }} FormFieldSlot
 * @typedef {Omit<import('react').InputHTMLAttributes<HTMLInputElement>, 'children' | 'id'> & {
 *   label: import('react').ReactNode,
 *   id?: string,
 *   hint?: import('react').ReactNode,
 *   error?: import('react').ReactNode,
 *   children?: (slot: FormFieldSlot) => import('react').ReactNode,
 * }} FormFieldProps
 */

/** Persistent label with canonical helper/error placement, or a shared control slot. */
/** @param {FormFieldProps} props */
export function FormField({ label, id: suppliedId, hint, error, children, ...inputProps }) {
  const generatedId = useId()
  const id = suppliedId ?? generatedId
  const description = error || hint
  return <div className="v2-form-field">
    <label htmlFor={id}>{label}</label>
    {children ? children({ id, describedBy: description ? `${id}-description` : undefined }) :
      <input {...inputProps} id={id} aria-invalid={error ? true : undefined} aria-describedby={description ? `${id}-description` : undefined} />}
    {description && <p id={`${id}-description`} className="v2-form-field__note" data-error={Boolean(error)} role={error ? 'alert' : undefined}>{description}</p>}
  </div>
}
