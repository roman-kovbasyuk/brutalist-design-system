import { useEffect, useRef, useState } from 'react'
import { AppButton } from '../actions/AppButton'

export type InlineTextProps = {
  label: string
  value?: string
  sourceKey?: string
  onSave: (value: string, sourceKey?: string) => void | { ok: boolean; message?: string } | Promise<void | { ok: boolean; message?: string }>
  onDirty?: (dirty: boolean) => void
  readOnly?: boolean
  multiline?: boolean
  required?: boolean
  maxLength?: number
  className?: string
}

/** A small, keyboard-friendly text editor for a single value. */
export function InlineText({ label, value = '', sourceKey, onSave, onDirty, readOnly = false, multiline = false, required = false, maxLength = 500, className = '' }: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const capturedSource = useRef(sourceKey)
  const saving = useRef(false)

  useEffect(() => { if (!editing) setDisplayValue(value) }, [value])
  const close = () => {
    setEditing(false)
    setError('')
    onDirty?.(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const save = async () => {
    if (saving.current || readOnly) return
    const nextValue = draft.trim()
    if (required && !nextValue) { setError(`${label} cannot be empty.`); return }
    saving.current = true
    setBusy(true); setError('')
    try {
      const result = capturedSource.current === undefined ? await onSave(nextValue) : await onSave(nextValue, capturedSource.current)
      if (result?.ok === false) { setError(result.message || 'Could not save changes.'); return }
      setDisplayValue(nextValue); close()
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save changes.') }
    finally { saving.current = false; setBusy(false) }
  }

  if (!editing) return readOnly
    ? <span className={`ds-inline-text-value ${className}`.trim()}>{displayValue || 'Not specified'}</span>
    : <button ref={triggerRef} type="button" className={`ds-inline-text-value ${className}`.trim()} aria-label={`Edit ${label.toLowerCase()}`}
      onClick={() => { capturedSource.current = sourceKey; setDraft(displayValue); setEditing(true); onDirty?.(true) }}>{displayValue || 'Not specified'}</button>

  return <div className={`ds-inline-text-editor ${className}`.trim()}>
    <textarea autoFocus aria-label={label} value={draft} maxLength={maxLength} rows={multiline ? 3 : 1} disabled={busy || readOnly}
      onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape' && !busy) { event.preventDefault(); setDisplayValue(value); close() }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save() }
      }} />
    <div className="ds-inline-text-editor__actions">
      <AppButton size="compact" onClick={() => void save()} busy={busy} disabled={readOnly}>Save</AppButton>
      <AppButton size="compact" variant="secondary" onClick={() => { setDisplayValue(value); close() }} disabled={busy}>Cancel</AppButton>
    </div>
    {error && <p className="ds-inline-text-editor__error" role="alert">{error}</p>}
    {capturedSource.current !== sourceKey && <p className="ds-inline-text-editor__note">The saved value changed. Your draft is kept; copy it before canceling to load the latest version.</p>}
  </div>
}
