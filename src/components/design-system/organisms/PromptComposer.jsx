import { useId, useRef, useState } from 'react'
import { ArrowUp, Paperclip, X } from 'lucide-react'
import { AppButton } from '../atoms/AppButton.jsx'
import '../../../styles/ui-blocks.css'

/** Operational version of the design-system AI composer; the caller owns requests. */
export function PromptComposer({
  value,
  onChange,
  files = [],
  onAttach,
  onRemove,
  onSubmit,
  disabled = false,
  readOnly = false,
  busy = false,
  canSubmit = false,
  submitLabel = 'Send prompt',
  label = 'Campaign description',
  formLabel = 'Campaign brief composer',
  rows = 7,
  maxLength,
  hint,
  placeholder = 'Describe what you’re promoting, or drop your campaign brief here…',
}) {
  const id = useId()
  const picker = useRef(null)
  const [dragging, setDragging] = useState(false)
  const locked = disabled || readOnly || busy
  function submit(event) {
    event?.preventDefault()
    if (!locked && canSubmit) onSubmit()
  }
  return (
    <form
      className="v2-prompt-block bs-prompt"
      aria-label={formLabel}
      aria-busy={busy || undefined}
      onSubmit={submit}
    >
      <div
        className="v2-block-composer"
        data-dragging={dragging}
        onDragOver={(event) => {
          event.preventDefault()
          if (!locked) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!locked) onAttach?.(event.dataTransfer.files)
        }}
      >
        {files.length > 0 && (
          <ul className="v2-block-attachments" aria-label="Brief attachments">
            {files.map((file) => (
              <li key={file.id}>
                <Paperclip size={16} aria-hidden="true" />
                <span>{file.name}</span>
                <button
                  type="button"
                  className="v2-block-icon"
                  aria-label={`Remove ${file.name}`}
                  disabled={locked}
                  onClick={() => onRemove(file.id)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <textarea
          id={id}
          value={value}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled || busy}
          readOnly={readOnly}
          aria-describedby={hint ? `${id}-hint` : undefined}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.metaKey || event.ctrlKey) &&
              !event.nativeEvent.isComposing
            )
              submit(event)
          }}
        />
        {!readOnly && (
          <div className="v2-block-toolbar">
            {onAttach && <><input
              ref={picker}
              className="v2-block-sr"
              tabIndex={-1}
              aria-label="Brief files"
              type="file"
              accept=".txt,.md,.markdown,.pdf,.docx"
              multiple
              disabled={locked}
              onChange={(event) => {
                onAttach?.(event.target.files)
                event.target.value = ''
              }}
            />
            <button
              type="button"
              className="v2-block-icon"
              aria-label="Attach brief files"
              disabled={locked}
              onClick={() => picker.current?.click()}
            >
              <Paperclip size={20} aria-hidden="true" />
            </button>
            <span className="bs-prompt-formats">TXT, MD, PDF, DOCX</span></>}
            <AppButton
              type="submit"
              variant="primary"
              className="bs-button bs-button--primary bs-prompt-send"
              disabled={locked || !canSubmit}
              busy={busy}
            >
              {busy ? 'Working…' : submitLabel}
              <ArrowUp size={17} aria-hidden="true" />
            </AppButton>
          </div>
        )}
      </div>
      {hint && <p id={`${id}-hint`} className="v2-block-hint">{hint}</p>}
    </form>
  )
}
