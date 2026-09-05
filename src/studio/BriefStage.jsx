import { useEffect, useRef, useState } from 'react'
import { PromptComposer } from '../components/design-system/PromptComposer.jsx'
import { SectionHeading } from './primitives.jsx'
import {
  briefTitle,
  briefToText,
  combineBrief,
  MAX_BRIEF_CHARACTERS,
  readBriefFile,
} from './briefInput.js'

export function BriefStage({
  campaign,
  api,
  onSave,
  onGenerate,
  pending,
  readOnly = false,
  onDirty = () => {},
}) {
  const [message, setMessage] = useState(() => briefToText(campaign?.brief))
  const [files, setFiles] = useState([])
  const [dirty, setDirty] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')
  const extractingRef = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    generation.current++
    setMessage(briefToText(campaign?.brief))
    setFiles([])
    setDirty(false)
    onDirty(false)
    return () => {
      generation.current++
    }
  }, [campaign?.id, campaign?.revision])
  const notes = combineBrief(message, files)
  const tooLong = notes.length > MAX_BRIEF_CHARACTERS
  function markDirty() {
    setDirty(true)
    onDirty(true)
  }
  async function attach(incoming) {
    if (extractingRef.current || pending || readOnly) return
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
    if (!notes.trim() || tooLong || pending || extracting || readOnly) return
    setError('')
    const input = {
      title: campaign?.title ?? briefTitle(message || files[0]?.text || notes),
      brief: { notes },
    }
    try {
      if (campaign && onGenerate) await onGenerate(dirty ? input : undefined)
      else await onSave(input)
    } catch (failure) {
      setError(failure.message)
    }
  }
  return (
    <section className="bs-brief">
      <SectionHeading as="h1" title={campaign ? 'Brief' : 'What are we creating?'} />
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
        readOnly={readOnly}
        disabled={Boolean(pending)}
        busy={extracting || Boolean(pending)}
        canSubmit={Boolean(notes.trim()) && !tooLong}
        submitLabel="Analyze brief"
        placeholder="Paste your idea or attach a brief. AI will use the context to write five banner options."
        hint={campaign ? '' : readOnly ? 'This brief is read-only.' : 'Up to 5 MB per file · 20,000 characters total · Ctrl / ⌘ + Enter to send'}
      />
      {extracting && (
        <p className="bs-note" role="status">
          Reading your brief…
        </p>
      )}
      {(error || tooLong) && (
        <p className="bs-brief-error" role="alert">
          {error ||
            'The combined brief exceeds 20,000 characters. Shorten it before continuing.'}
        </p>
      )}
    </section>
  )
}
