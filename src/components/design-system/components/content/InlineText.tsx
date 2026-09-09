import { useEffect, useRef, useState } from 'react'
import { AppButton } from '../actions/AppButton'

export type InlineTextProps = {
  label: string
  value?: string
  onSave: (value: string) => void | Promise<void>
  readOnly?: boolean
  multiline?: boolean
  required?: boolean
  maxLength?: number
  className?: string
}

/** A small, keyboard-friendly text editor for a single value. */
export function InlineText({ label, value = '', onSave, readOnly = false, multiline = false, required = false, maxLength = 500, className = '' }: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { if (!editing) setDisplayValue(value) }, [value])
  const close = () => {
    setEditing(false)
    setError('')
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const save = async () => {
    const nextValue = draft.trim()
    if (required && !nextValue) { setError(`${label} cannot be empty.`); return }
    setBusy(true); setError('')
    try { await onSave(nextValue); setDisplayValue(nextValue); close() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save changes.') }
    finally { setBusy(false) }
  }

  if (!editing) return readOnly
    ? <span className={`ds-inline-text-value ${className}`.trim()}>{displayValue || 'Not specified'}</span>
    : <button ref={triggerRef} type="button" className={`ds-inline-text-value ${className}`.trim()} aria-label={`Edit ${label.toLowerCase()}`}
      onClick={() => { setDraft(displayValue); setEditing(true) }}>{displayValue || 'Not specified'}</button>

  return <div className={`ds-inline-text-editor ${className}`.trim()}>
    <textarea autoFocus aria-label={label} value={draft} maxLength={maxLength} rows={multiline ? 3 : 1} disabled={busy}
      onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape' && !busy) { event.preventDefault(); close() }
        if (event.key === 'Enter' && !event.shiftKey && !multiline) { event.preventDefault(); void save() }
      }} />
    <div className="ds-inline-text-editor__actions">
      <AppButton size="compact" onClick={() => void save()} busy={busy}>Save</AppButton>
      <AppButton size="compact" variant="secondary" onClick={close} disabled={busy}>Cancel</AppButton>
    </div>
    {error && <p className="ds-inline-text-editor__error" role="alert">{error}</p>}
  </div>
}
