import { useState, type FormEvent } from 'react'
import type { SaveResult } from '../../basics/types'

export type SettingsValue = { name: string; language: string; notifications: boolean }
export type SettingsFormProps = { initialValue: SettingsValue; onSave(value: SettingsValue): Promise<SaveResult> }

export function SettingsForm({ initialValue, onSave }: SettingsFormProps) {
  const [draft, setDraft] = useState(initialValue)
  const [saved, setSaved] = useState(initialValue)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const update = <K extends keyof SettingsValue>(key: K, value: SettingsValue[K]) => setDraft(current => ({ ...current, [key]: value }))
  const valid = draft.name.trim().length > 0
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!valid || pending) return
    setPending(true); setMessage(null)
    const result = await onSave(draft)
    setPending(false)
    if (result.ok) setSaved(draft); else setMessage(result.message)
  }
  return <form className="ds-settings-form" onSubmit={submit}>
    <div className="ds-settings-form__field"><label htmlFor="settings-name">Workspace name</label><input id="settings-name" value={draft.name} onChange={e => update('name', e.target.value)} aria-invalid={!valid || undefined} /></div>
    <div className="ds-settings-form__field"><label htmlFor="settings-language">Language</label><select id="settings-language" value={draft.language} onChange={e => update('language', e.target.value)}><option>English</option><option>Deutsch</option><option>Français</option></select></div>
    <label className="ds-settings-form__check"><input type="checkbox" checked={draft.notifications} onChange={e => update('notifications', e.target.checked)} /> Notifications</label>
    {message && <p role="alert">{message}</p>}
    <footer><button type="button" onClick={() => { setDraft(saved); setMessage(null) }} disabled={!dirty || pending}>Cancel</button><button type="submit" disabled={!valid || !dirty || pending}>{pending ? 'Saving…' : 'Save settings'}</button></footer>
  </form>
}
