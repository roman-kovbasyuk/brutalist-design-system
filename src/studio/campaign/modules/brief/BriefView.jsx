import { useEffect, useRef, useState } from 'react'
import { PromptComposer } from '../../../../components/design-system/organisms/PromptComposer.jsx'
import { AsyncStatus } from '../../../../components/design-system/molecules/AsyncStatus.jsx'
import { Button, SectionHeading } from '../../../primitives.jsx'
import {
  briefTitle,
  briefToText,
  combineBrief,
  MAX_BRIEF_CHARACTERS,
  readBriefFile,
} from '../../../briefInput.js'

export function BriefView({
  campaign,
  api,
  onSave,
  onGenerate,
  pending,
  readOnly = false,
  onDirty = () => {},
  analyzed = false,
  heading = true,
  inputKey = JSON.stringify(campaign?.brief ?? null),
  operationError,
}) {
  const [message, setMessage] = useState(() => briefToText(campaign?.brief))
  const [files, setFiles] = useState([])
  const [dirty, setDirty] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState('')
  const extractingRef = useRef(false)
  const generation = useRef(0)
  const sourceKey = useRef(inputKey)
  useEffect(() => {
    generation.current++
    return () => {
      generation.current++
    }
  }, [campaign?.id])
  useEffect(() => {
    if (dirty) return
    setMessage(briefToText(campaign?.brief))
    setFiles([])
    sourceKey.current = inputKey
  }, [inputKey, dirty])
  const notes = combineBrief(message, files)
  const tooLong = notes.length > MAX_BRIEF_CHARACTERS
  function markDirty() {
    setDirty(true)
    onDirty(true)
  }
  async function attach(incoming) {
    if (extractingRef.current || submittingRef.current || pending || readOnly) return
    extractingRef.current = true
    setExtracting(true)
    setError('')
    const ticket = generation.current
    try {
      const added = []
      for (const file of Array.from(incoming)) {
        const result = await api.extractBriefFile(await readBriefFile(file))
        if (!result.text?.trim())
          throw new Error(
            'This file has no readable text. Paste the brief instead.',
          )
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          text: result.text,
        })
        if (
          combineBrief(message, [...files, ...added]).length >
          MAX_BRIEF_CHARACTERS
        )
          throw new Error(
            'The combined brief exceeds 20,000 characters. Shorten the text or attach a shorter document.',
          )
      }
      if (ticket === generation.current) {
        setFiles((previous) => [...previous, ...added])
        markDirty()
      }
    } catch (failure) {
      if (ticket === generation.current) setError(failure.message)
    } finally {
      extractingRef.current = false
      if (ticket === generation.current) setExtracting(false)
    }
  }
  async function submit() {
    if (!notes.trim() || tooLong || pending || extracting || readOnly || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    const input = {
      title: campaign?.title ?? briefTitle(message || files[0]?.text || notes),
      brief: { notes },
    }
    try {
      const result = campaign && onGenerate
        ? await onGenerate(dirty ? input : undefined, { expectedInputKey: sourceKey.current })
        : await onSave(input)
      if (result?.ok === false) setError(result.message)
      if (result?.ok || result?.briefSaved) {
        setDirty(false)
        onDirty(false)
        setFiles([])
        setMessage(notes)
      }
    } catch (failure) {
      setError(failure.message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }
  return (
    <section className="bs-brief" data-analyzed={analyzed ? 'true' : 'false'}>
      {heading && <SectionHeading as={campaign ? 'h2' : 'h1'} title={campaign ? 'Brief' : 'What are we creating?'} />}
      {(pending || submitting) && <AsyncStatus>{pending === 'save' ? 'Saving your brief…' : 'Analyzing your brief and preparing the first drafts…'}</AsyncStatus>}
      <PromptComposer
        value={message}
        onChange={(value) => {
          setMessage(value)
          markDirty()
        }}
        files={files}
        onAttach={attach}
        onRemove={(id) => {
          setFiles((previous) => previous.filter((file) => file.id !== id))
          markDirty()
        }}
        onSubmit={submit}
        compact={analyzed}
        iconOnlySubmit
        readOnly={readOnly}
        disabled={Boolean(pending) || submitting}
        busy={extracting || submitting || Boolean(pending)}
        canSubmit={Boolean(notes.trim()) && !tooLong}
        submitLabel="Analyze brief"
        placeholder={analyzed ? 'Add more context…' : 'Paste your idea or attach a brief. AI will use the context to write five banner options.'}
        hint={campaign ? '' : readOnly ? 'This brief is read-only.' : 'Up to 5 MB per file · 20,000 characters total · Ctrl / ⌘ + Enter to send'}
      />
      {dirty && sourceKey.current !== inputKey && <div className="bs-info"><p>The saved brief changed. Your draft is kept here; reload the saved brief before submitting again.</p>
        <Button onClick={() => { setDirty(false); onDirty(false); setError('') }}>Reload saved brief</Button></div>}
      {extracting && (
        <p className="bs-note" role="status">
          Reading your brief…
        </p>
      )}
      {(error || operationError || tooLong) && (
        <p className="bs-brief-error" role="alert">
          {error || operationError?.message ||
            'The combined brief exceeds 20,000 characters. Shorten it before continuing.'}
        </p>
      )}
    </section>
  )
}
