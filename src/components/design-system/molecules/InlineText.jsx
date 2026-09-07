import { useRef, useState } from 'react'
import { AppButton } from '../atoms/AppButton.jsx'
import './inline-text.css'

/** Text-first editor. Captures the source when editing begins; failures retain
 * the draft. Enter saves, Shift+Enter adds a line, Escape discards local edits. */
export function InlineText({ label, value = '', sourceKey, onSave, onDirty = () => {}, readOnly = false, maxLength = 500, required = false, multiline = false }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const captured = useRef(sourceKey), saving = useRef(false), trigger = useRef(null)
  const close = () => { setEditing(false); setError(''); onDirty(false); requestAnimationFrame(() => trigger.current?.focus()) }
  const save = async () => {
    if (saving.current || readOnly) return
    if (required && !draft.trim()) { setError(`${label} cannot be empty.`); return }
    saving.current = true; setBusy(true); setError('')
    try {
      const result = await onSave(draft.trim(), captured.current)
      if (result?.ok === false) setError(result.message)
      else close()
    } catch (failure) { setError(failure.message) }
    finally { saving.current = false; setBusy(false) }
  }
  if (!editing) return readOnly ? <span className="v2-inline-text-value">{value || 'Not specified'}</span>
    : <button ref={trigger} type="button" className="v2-inline-text-value" aria-label={`Edit ${label.toLowerCase()}`}
      onClick={() => { captured.current = sourceKey; setDraft(value); setEditing(true); onDirty(true) }}>{value || 'Not specified'}</button>
  return <div className="v2-inline-text-editor">
    <textarea autoFocus aria-label={label} value={draft} maxLength={maxLength} rows={multiline ? 3 : 2}
      disabled={busy || readOnly} onChange={event => setDraft(event.target.value)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape' && !busy) { event.preventDefault(); close() }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save() }
      }} />
    <div className="v2-inline-text-actions">
      <AppButton size="compact" onClick={save} busy={busy} disabled={readOnly}>Save</AppButton>
      <AppButton size="compact" onClick={close} disabled={busy}>Cancel</AppButton>
    </div>
    {captured.current !== sourceKey && <p className="v2-inline-text-note">The saved brief changed. Your draft is kept; copy it before canceling to load the latest version.</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
