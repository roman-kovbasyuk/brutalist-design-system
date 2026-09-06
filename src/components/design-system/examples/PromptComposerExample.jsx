import { useState } from 'react'
import { PromptComposer } from '../organisms/PromptComposer.jsx'
import { readBriefFile, MAX_BRIEF_CHARACTERS } from '../../../studio/briefInput.js'
import { SpecimenSection } from './SpecimenSection.jsx'

export function PromptComposerExample() {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState([])
  const [readOnly, setReadOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  async function attach(incoming) {
    try {
      const validated = await Promise.all(Array.from(incoming).map(readBriefFile))
      setFiles(current => [...current, ...validated.map(file => ({ id: crypto.randomUUID(), name: file.name }))])
      setError('')
      setStatus('Files checked locally. Document extraction is performed by the production caller.')
    } catch (failure) { setError(failure.message) }
  }
  const tooLong = value.length > MAX_BRIEF_CHARACTERS
  return <SpecimenSection index={11} title="Production composer" description="Shared component · the same composer used by campaign entry and BriefStage.">
    <PromptComposer value={value} onChange={setValue} files={files} onAttach={attach}
      onRemove={id => setFiles(current => current.filter(file => file.id !== id))}
      onSubmit={() => setStatus('Preview submitted locally. No generation request was sent.')}
      canSubmit={Boolean(value.trim()) && !tooLong} readOnly={readOnly} busy={busy}
      submitLabel="Preview brief submission"
      hint="Up to 5 MB per file · 20,000 characters total after extraction · Ctrl / ⌘ + Enter to send. This example does not extract documents or call AI." />
    <div className="v2-choice-stack">
      <label className="v2-check-control"><input type="checkbox" checked={readOnly} onChange={event => setReadOnly(event.target.checked)} />Preview read-only brief</label>
      <label className="v2-check-control"><input type="checkbox" checked={busy} onChange={event => setBusy(event.target.checked)} />Preview busy composer</label>
    </div>
    {(error || tooLong) && <p role="alert">{error || 'Shorten the brief to 20,000 characters or fewer.'}</p>}
    <p role="status">{status}</p>
  </SpecimenSection>
}
