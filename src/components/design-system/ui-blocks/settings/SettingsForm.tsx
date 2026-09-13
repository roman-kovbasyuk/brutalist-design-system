import { useState, type FormEvent } from 'react'
import type { SaveResult } from '../../basics/types'
import { AppButton } from '../../components/actions/AppButton'
import { CheckboxField, Form, FormActions, FormSection, SwitchField, TextField } from '../../components/forms'
import { FactGrid, Panel } from '../../components/content'
import { Alert } from '../../components/feedback'
import { FormField } from '../../molecules/FormField.jsx'
import { SelectMenu } from '../../molecules/SelectMenu.jsx'

export type SettingsValue = {
  name: string; language: string; notifications: boolean
  preferences?: { theme: string; density: string; summary: boolean; mentions: boolean; replies: boolean; sounds: boolean }
}
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
    event.preventDefault(); if (!valid || !dirty || pending) return
    setPending(true); setMessage(null)
    try {
      const result = await onSave(draft)
      if (result.ok) { setSaved(draft); setMessage('Settings saved.') }
      else setMessage(result.message)
    } catch {
      setMessage('Could not save settings. Try again.')
    } finally {
      setPending(false)
    }
  }
  const preferences = draft.preferences
  const updatePreference = (patch: Partial<NonNullable<SettingsValue['preferences']>>) => {
    if (preferences) update('preferences', { ...preferences, ...patch })
  }
  return <Form className="ds-settings-form" aria-label="Workspace settings" onSubmit={submit}>
    <Panel title="Workspace" description="Set your workspace name and preferred language.">
      <FormSection title="Workspace" disabled={pending} className="ds-settings-form__section">
      <TextField label="Workspace name" value={draft.name} disabled={pending} onChange={e => update('name', e.target.value)} error={!valid ? 'Enter a workspace name.' : undefined} />
      <FormField label="Language">{({ id, describedBy }) => <SelectMenu label="Language" triggerId={id} describedBy={describedBy} value={draft.language} disabled={pending} options={['English', 'Deutsch', 'Français', '日本語']} onChange={value => update('language', value)} />}</FormField>
      </FormSection>
    </Panel>
    {preferences && <Panel title="Appearance" description="Choose how your workspace looks and feels.">
      <FormSection title="Appearance" disabled={pending} className="ds-settings-form__section">
      <FormField label="Appearance" hint="Theme preview only; this does not change the application theme.">{({ id, describedBy }) => <SelectMenu label="Appearance" triggerId={id} describedBy={describedBy} value={preferences.theme} disabled={pending} options={['System', 'Light', 'Dark']} onChange={value => updatePreference({ theme: value })} />}</FormField>
      <FormField label="Density">{({ id, describedBy }) => <SelectMenu label="Density" triggerId={id} describedBy={describedBy} value={preferences.density} disabled={pending} options={['Comfortable', 'Compact']} onChange={value => updatePreference({ density: value })} />}</FormField>
      <FactGrid label="Preferences preview"
        theme={preferences.theme === 'Dark' ? 'dark' : preferences.theme === 'Light' ? 'light' : 'system'}
        density={preferences.density === 'Compact' ? 'compact' : 'comfortable'}
        items={[{ id: 'campaign', label: 'Campaign', value: 'Oslo launch' }, { id: 'review', label: 'Review', value: 'Ready for feedback' }]} />
      </FormSection>
    </Panel>}
    <Panel title="Notifications" description="Choose which updates you receive.">
      <FormSection title="Notifications" disabled={pending} className="ds-settings-form__section">
      <CheckboxField label="Notifications" checked={draft.notifications} disabled={pending} onChange={e => update('notifications', e.target.checked)} />
      {preferences && <>
        {([['summary', 'Weekly summary'], ['mentions', 'Mentions'], ['replies', 'Comment replies']] as const).map(([key, label]) => <SwitchField key={key} label={label} checked={preferences[key]} disabled={pending} onCheckedChange={value => updatePreference({ [key]: value })} />)}
        <CheckboxField label="Play notification sounds" checked={preferences.sounds} disabled={pending} onChange={e => updatePreference({ sounds: e.target.checked })} />
      </>}
      </FormSection>
    </Panel>
    {message && <Alert tone={message === 'Settings saved.' ? 'success' : 'danger'}>{message}</Alert>}
    <FormActions>
      <AppButton onClick={() => { setDraft(saved); setMessage(null) }} disabled={!dirty || pending}>Cancel</AppButton>
      <AppButton variant="primary" type="submit" disabled={!valid || !dirty} busy={pending}>{pending ? 'Saving…' : 'Save settings'}</AppButton>
    </FormActions>
  </Form>
}
