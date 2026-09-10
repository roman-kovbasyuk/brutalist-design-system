import { SettingsPanel, SettingsRow, SettingsFooter } from '../organisms/SettingsPanel.jsx'
import { Switch } from '../atoms/Switch.jsx'
import { AppButton } from '../atoms/AppButton.jsx'
import { TokenCopyTarget } from '../atoms/TokenCopyTarget.jsx'
import { SelectMenu } from '../molecules/SelectMenu.jsx'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUp, Check, Clock, Globe, Monitor, Moon, Paperclip, Square, Sun, Video, X } from 'lucide-react'
import { SpecimenSection } from './SpecimenSection.jsx'
import { chartBlockCatalog } from './ChartBlocks.jsx'
import '../../../styles/ui-blocks.css'


const commands = [
  { name: 'brief', description: 'Start a campaign brief', text: 'Create a campaign brief for ' },
  { name: 'rewrite', description: 'Refine an existing message', text: 'Rewrite this message for clarity: ' },
  { name: 'ideas', description: 'Explore creative directions', text: 'Suggest five visual directions for ' },
]

export function PromptInputBlock() {
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])
  const [model, setModel] = useState('Studio')
  const [effort, setEffort] = useState('Balanced')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [dragging, setDragging] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [activeCommand, setActiveCommand] = useState(0)
  const textarea = useRef(null)
  const picker = useRef(null)
  const timer = useRef(null)
  const id = useId()
  const matches = message.startsWith('/') && !dismissed ? commands.filter((item) => item.name.startsWith(message.slice(1).toLowerCase())) : []
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const field = textarea.current
    field.style.height = 'auto'
    field.style.height = `${Math.min(240, Math.max(112, field.scrollHeight))}px`
  }, [message])
  function attach(incoming) {
    const accepted = Array.from(incoming).filter((file) => file.size <= 25 * 1024 * 1024)
    setFiles((current) => [...current, ...accepted.map((file) => ({ file, id: crypto.randomUUID() }))])
    setStatus(accepted.length === incoming.length ? `${accepted.length} file${accepted.length === 1 ? '' : 's'} attached.` : 'Files larger than 25 MB were skipped.')
  }
  function choose(command) { setMessage(command.text); setDismissed(true); textarea.current?.focus() }
  function send(event) {
    event?.preventDefault()
    if (busy) { clearTimeout(timer.current); setBusy(false); setStatus('Generation stopped. Your prompt is preserved.'); return }
    if (!message.trim()) return
    setBusy(true); setStatus('Preparing your prompt…')
    timer.current = setTimeout(() => { setBusy(false); setStatus('Prompt prepared. Demo complete; no AI request was sent.') }, 1800)
  }
  return <form className="v2-block v2-prompt-block" aria-label="Prompt composer" onSubmit={send}>
    <div className="v2-block-composer" data-dragging={dragging} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); setDragging(false); attach(event.dataTransfer.files) }}>
      {files.length > 0 && <ul className="v2-block-attachments" aria-label="Prompt attachments">{files.map(({file, id: fileId}) => <li key={fileId}><Paperclip size={16} aria-hidden="true" /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><button type="button" className="v2-block-icon" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item.id !== fileId))}><X size={16} aria-hidden="true" /></button></li>)}</ul>}
      <label className="v2-block-sr" htmlFor={id}>Campaign prompt</label>
      <textarea id={id} ref={textarea} value={message} placeholder="Describe your campaign, or type / for a command…" onChange={(event) => { setMessage(event.target.value); setDismissed(false); setActiveCommand(0) }} onKeyDown={(event) => {
        if (matches.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setActiveCommand((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length) }
        if (event.key === 'Escape') setDismissed(true)
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (matches.length) choose(matches[activeCommand]); else send() }
      }} />
      {matches.length > 0 && <div className="v2-block-commands" role="group" aria-label="Slash commands">{matches.map((command, index) => <button type="button" key={command.name} data-highlighted={index === activeCommand} onClick={() => choose(command)}><strong>/{command.name}</strong><span>{command.description}</span></button>)}</div>}
      <div className="v2-block-toolbar">
        <input ref={picker} className="v2-block-sr" tabIndex={-1} aria-label="Prompt files" type="file" multiple onChange={(event) => { attach(event.target.files); event.target.value = '' }} />
        <button type="button" className="v2-block-icon" aria-label="Attach prompt files" onClick={() => picker.current?.click()}><Paperclip size={20} aria-hidden="true" /></button>
        <SelectMenu label="Prompt model" value={model} options={['Studio', 'Creative', 'Precise']} onChange={setModel} />
        <SelectMenu label="Prompt effort" value={effort} options={['Quick', 'Balanced', 'Thorough']} onChange={setEffort} />
        <button type="submit" className="v2-button v2-button--primary v2-block-send" disabled={!busy && !message.trim()} aria-label={busy ? 'Stop generation' : 'Send prompt'}>{busy ? <Square size={20} aria-hidden="true" /> : <ArrowUp size={20} aria-hidden="true" />}</button>
      </div>
    </div>
    <p className="v2-block-status" role="status">{status}</p>
  </form>
}

const availableDays = [
  { day: 14, label: 'Mon', times: ['09:00', '09:30', '10:00', '11:00', '13:00', '14:30'] },
  { day: 15, label: 'Tue', times: ['10:00', '14:00'] },
  { day: 16, label: 'Wed', times: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00'] },
  { day: 17, label: 'Thu', times: [] },
  { day: 18, label: 'Fri', times: ['09:00', '10:00', '13:00', '15:00'] },
  { day: 19, label: 'Sat', times: [] },
  { day: 21, label: 'Mon', times: ['09:00', '10:00', '11:00'] },
  { day: 22, label: 'Tue', times: ['09:00', '11:00', '14:00', '15:00'] },
]

export function SchedulingBlock() {
  const [day, setDay] = useState(16)
  const [time, setTime] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const id = useId()
  const selected = availableDays.find((item) => item.day === day)
  return <div className="v2-block v2-booking-block">
    <aside className="v2-booking-summary"><div className="v2-block-avatar" aria-hidden="true">JL</div><p>Jordan Lee · Design team</p><h4>Campaign review</h4><p>A focused review of your copy, visuals, and next steps.</p><ul><li><Clock size={18} aria-hidden="true" />30 minutes</li><li><Video size={18} aria-hidden="true" />Video call</li><li><Globe size={18} aria-hidden="true" />Europe/Zurich · CEST</li></ul><small>Sample availability for September 2026.</small></aside>
    <div className="v2-booking-picker">
      <div className="v2-block-row-heading"><h4>Pick a day</h4><span>September 2026</span></div>
      <fieldset className="v2-block-days"><legend className="v2-block-sr">Available review days</legend>{availableDays.map((item) => <label key={item.day}><input type="radio" name={`${id}-day`} aria-label={`September ${item.day}`} checked={day === item.day} disabled={!item.times.length} onChange={() => { setDay(item.day); setTime(''); setConfirmed(false) }} /><span><small>{item.label}</small><strong>{item.day}</strong><small>{item.times.length ? `${item.times.length} free` : 'Full'}</small></span></label>)}</fieldset>
      <fieldset className="v2-block-times"><legend>Times on September {day}</legend>{selected.times.map((slot) => <label key={slot}><input type="radio" name={`${id}-time`} aria-label={slot} checked={time === slot} onChange={() => { setTime(slot); setConfirmed(false) }} /><span>{slot}</span></label>)}</fieldset>
      <div className="v2-block-footer"><p role="status">{confirmed ? `Demo booking confirmed: September ${day} at ${time}.` : time ? `September ${day} at ${time}` : 'Select a time to continue.'}</p><button type="button" className="v2-button v2-button--primary" disabled={!time || confirmed} onClick={() => setConfirmed(true)}>{confirmed ? <><Check size={16} aria-hidden="true" />Confirmed</> : 'Confirm time'}</button></div>
    </div>
  </div>
}

const initialPreferences = { theme: 'Light', density: 'Comfortable', language: 'English', summary: true, mentions: true, replies: false, sounds: false }
export function SettingsBlock() {
  const [saved, setSaved] = useState(initialPreferences)
  const [draft, setDraft] = useState(initialPreferences)
  const [notice, setNotice] = useState('')
  const id = useId()
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  function update(key, value) { setDraft(current => ({ ...current, [key]: value })); setNotice('') }
  return <SettingsPanel as="form" title="Workspace preferences" description="Make room for the way you work."
    onSubmit={event => { event.preventDefault(); setSaved({ ...draft }); setNotice('Preferences saved for this preview.') }}
    footer={<SettingsFooter message={dirty ? 'Unsaved preferences' : notice || 'Preferences up to date'}>
      <AppButton disabled={!dirty} onClick={() => { setDraft({ ...saved }); setNotice('Changes discarded.') }}>Cancel</AppButton>
      <AppButton variant="primary" type="submit" disabled={!dirty}>Save preferences</AppButton>
    </SettingsFooter>}>
    <SettingsRow label="Appearance" description="Preview your preferred workspace theme." className="v2-settings-row--elevated">
      <fieldset className="v2-theme-options"><legend className="v2-block-sr">Workspace theme</legend>{[[Monitor, 'System'], [Sun, 'Light'], [Moon, 'Dark']].map(([Icon, label]) => <label key={label}><input type="radio" name={`${id}-theme`} checked={draft.theme === label} onChange={() => update('theme', label)} /><span><Icon size={20} aria-hidden="true" />{label}</span></label>)}</fieldset>
    </SettingsRow>
    <SettingsRow label="Density" description="Spacing for tables and panels."><div className="v2-segmented-control" role="group" aria-label="Workspace density">{['Comfortable', 'Compact'].map(value => <button type="button" aria-pressed={draft.density === value} key={value} onClick={() => update('density', value)}>{value}</button>)}</div></SettingsRow>
    <div className="v2-preference-preview" data-theme={draft.theme.toLowerCase()} data-density={draft.density.toLowerCase()} aria-label="Preferences preview"><span>Campaign</span><strong>Oslo launch</strong><span>Review</span><strong>Ready for feedback</strong></div>
    <SettingsRow label="Language" description="Default language for your workspace."><SelectMenu label="Workspace language" value={draft.language} options={['English', 'Deutsch', 'Français', '日本語']} onChange={value => update('language', value)} /></SettingsRow>
    {[['summary', 'Weekly summary', 'A Monday digest of campaign activity.'], ['mentions', 'Mentions', 'When a teammate asks for your attention.'], ['replies', 'Comment replies', 'Follow the conversations you joined.']].map(([key, label, help]) => <SettingsRow key={key} label={label} description={help} compact><Switch label={label} checked={draft[key]} onChange={value => update(key, value)} /></SettingsRow>)}
    <SettingsRow label="Notification sounds" compact><label className="v2-check-control"><input type="checkbox" checked={draft.sounds} onChange={event => update('sounds', event.target.checked)} />Play notification sounds</label></SettingsRow>
  </SettingsPanel>
}

export const uiBlockCatalog = [
  { id: 'prompt-input', name: 'Prompt input', component: 'PromptInputBlock', group: 'AI', render: () => <PromptInputBlock /> },
  { id: 'scheduling', name: 'Scheduling', component: 'SchedulingBlock', group: 'Scheduling', render: () => <SchedulingBlock /> },
  { id: 'settings-form', name: 'Settings form', component: 'SettingsBlock', group: 'Settings', render: () => <SettingsBlock /> },
  ...chartBlockCatalog,
]

export function UIBlocks({ catalog = uiBlockCatalog, title = 'UI blocks', index = 10 }) {
  const groups = [...new Set(catalog.map(block => block.group))].sort((a, b) => a.localeCompare(b))
  useEffect(() => {
    // This catalog mounts after the route's lazy import; restore its deep link.
    const frame = requestAnimationFrame(() => {
      const id = window.location.hash.slice(1)
      if (id.startsWith('ds-')) document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  return <SpecimenSection index={index} title={title} className="v2-section--blocks">
    <div className="v2-ui-block-groups">
      {groups.map(group => <section className="v2-ui-block-group" data-chart-group={chartBlockCatalog.some(block => block.group === group) || undefined} key={group} aria-labelledby={`ui-block-group-${group.toLowerCase().replaceAll(' ', '-')}`}>
        <div className="v2-ui-block-group__panel">
          <h3 id={`ui-block-group-${group.toLowerCase().replaceAll(' ', '-')}`}>{group}</h3>
          <div className="v2-ui-block-grid">
            {catalog.filter(block => block.group === group).sort((a, b) => a.name.localeCompare(b.name)).map(block => <TokenCopyTarget component className="v2-ui-block-cell" id={`ds-${block.id}`} key={block.id}
              copyValue={block.component} label={`${block.name} UI block`}
              preview={<div className="v2-ui-block-cell__preview">{block.render()}</div>}>
              <strong>{block.name}</strong>
            </TokenCopyTarget>)}
          </div>
        </div>
      </section>)}
    </div>
  </SpecimenSection>
}

export function DataVisualization() {
  return <UIBlocks catalog={chartBlockCatalog} title="Data visualization" index={11} />
}
