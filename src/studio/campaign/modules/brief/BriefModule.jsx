import { BriefView } from './BriefView.jsx'
import { useRef, useState } from 'react'
import { InlineText } from '../../../../components/design-system/molecules/InlineText.jsx'
import { FactGrid } from '../../../../components/design-system/molecules/FactGrid.jsx'
import { AsyncStatus } from '../../../../components/design-system/molecules/AsyncStatus.jsx'
import { PromptComposer } from '../../../../components/design-system/organisms/PromptComposer.jsx'
import { briefAnalysisSchema } from '../../../../../shared/briefAnalysis.js'
import './brief.css'

export default function BriefModule({ port }) {
  const { brief } = port.input
  const latestAnalysis = useRef(port.input.analysis)
  if (port.input.analysis) latestAnalysis.current = port.input.analysis
  const [rawDirty, setRawDirty] = useState(false), [resultDirty, setResultDirty] = useState(false)
  const analysis = port.input.analysis ?? (resultDirty ? latestAnalysis.current : null)
  const [chat, setChat] = useState(''), [error, setError] = useState(''), [submitting, setSubmitting] = useState(false)
  const source = useRef(port.inputKey), busy = useRef(false), dirtyFields = useRef(new Set())
  function markDirty(field, dirty) {
    dirty ? dirtyFields.current.add(field) : dirtyFields.current.delete(field)
    setResultDirty(dirtyFields.current.size > 0)
    port.setDirty(dirtyFields.current.size > 0)
  }
  const running = port.operation.kind === 'running'
  const locked = !port.access.canEdit || !port.input.analysis || submitting || running
  async function refine() {
    if (locked || busy.current || !chat.trim()) return
    busy.current = true; setSubmitting(true); setError('')
    try {
      const result = await port.actions.refine(chat.trim(), { expectedInputKey: source.current })
      if (result?.ok === false) setError(result.message)
      else { setChat(''); markDirty('chat', false) }
    } catch (failure) { setError(failure.message) }
    finally { busy.current = false; setSubmitting(false) }
  }
  const edit = (field, label, { list = false, ...props } = {}) => <InlineText label={label}
    value={list ? (analysis[field] ?? []).join(', ') : analysis[field] ?? brief[field] ?? ''}
    sourceKey={port.inputKey} readOnly={locked} onDirty={dirty => markDirty(field, dirty)} {...props}
    onSave={(value, expectedInputKey) => {
      const result = briefAnalysisSchema.safeParse({ ...analysis, [field]: list ? value.split(',').map(item => item.trim()).filter(Boolean) : value })
      if (!result.success) return { ok: false, message: list ? 'Use up to 20 comma-separated values, at most 100 characters each.' : 'Shorten this value and try again.' }
      return port.actions.save({ brief: { ...brief, analysis: result.data } }, { expectedInputKey })
    }} />
  if (!analysis || rawDirty) return <BriefView campaign={{ brief }} inputKey={port.inputKey} heading={false} operationError={port.operation.error}
    api={{ extractBriefFile: port.actions.extractFile }} onGenerate={port.actions.submit}
    onDirty={value => { setRawDirty(value); port.setDirty(value) }} readOnly={!port.access.canEdit} pending={running ? port.operation.actionId : ''} />
  return <>
    {(running || submitting) && <AsyncStatus>{port.operation.actionId === 'save' ? 'Saving your changes…' : 'Updating the brief from your input…'}</AsyncStatus>}
    <div className="bs-brief-results" aria-label="Analyzed brief" aria-busy={running || submitting || undefined}>
      <div className="bs-brief-results-summary">{edit('summary', 'Summary', { maxLength: 1000, multiline: true, required: true })}</div>
      <FactGrid label="Campaign details" items={[
        { id: 'audience', label: 'Audience', emphasis: true, heading: true, content: edit('audience', 'Audience') },
        { id: 'objective', label: 'Objective', content: edit('objective', 'Objective') },
        { id: 'channels', label: 'Channels', content: edit('channels', 'Channels', { list: true, maxLength: 2000 }) },
        { id: 'formats', label: 'Formats', content: edit('formats', 'Formats', { list: true, maxLength: 2000 }) },
      ]} />
      {analysis.warnings?.length > 0 && <ul className="bs-note">{analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      <PromptComposer label="Refine brief" formLabel="Brief refinement" rows={3} maxLength={4000} compact iconOnlySubmit
        value={chat} onChange={value => { if (!chat) source.current = port.inputKey; setChat(value); markDirty('chat', Boolean(value)) }}
        onSubmit={refine} canSubmit={Boolean(chat.trim()) && !locked} readOnly={!port.access.canEdit && !running}
        busy={submitting || (running && port.operation.actionId === 'analyze')} disabled={submitting || running}
        submitLabel="Update brief" placeholder="Ask AI to refine the summary or campaign details…" />
      {chat && source.current !== port.inputKey && <p className="bs-note">The brief changed while you were writing. Your message is kept. Clear it to start from the updated brief.</p>}
      {(error || port.operation.error) && <p role="alert" className="bs-brief-error">{error || port.operation.error.message}</p>}
    </div>
  </>
}
