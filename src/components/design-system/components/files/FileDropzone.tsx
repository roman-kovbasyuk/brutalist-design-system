import { useId, useRef, type ChangeEvent, type DragEvent, type ReactNode } from 'react'

export type FileDropzoneProps = {
  /** Visible label and accessible name for the native file input. */
  label: ReactNode
  /** Called with the newly selected files. The caller owns all file state. */
  onFilesChange: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  description?: ReactNode
  chooseLabel?: string
  className?: string
  id?: string
}

/**
 * A controlled local-file picker. It does not upload, validate, or retain files.
 */
export function FileDropzone({
  label,
  onFilesChange,
  accept,
  multiple = true,
  disabled = false,
  description = 'Drop files here or choose files from your device.',
  chooseLabel = 'Choose files',
  className = '',
  id: providedId,
}: FileDropzoneProps) {
  const generatedId = useId()
  const inputId = providedId ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)

  const emitFiles = (files: FileList | null) => {
    if (!disabled && files) onFilesChange(Array.from(files))
  }
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    emitFiles(event.currentTarget.files)
    // Allow selecting the same file again after a caller removes it.
    event.currentTarget.value = ''
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    emitFiles(event.dataTransfer.files)
  }

  return <div
    className={`ds-file-dropzone ${className}`.trim()}
    data-disabled={disabled || undefined}
    onDragOver={(event) => event.preventDefault()}
    onDrop={onDrop}
  >
    <input
      ref={inputRef}
      id={inputId}
      className="ds-file-dropzone__input"
      type="file"
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      aria-label={typeof label === 'string' ? label : undefined}
      onChange={onInputChange}
    />
    <div className="ds-file-dropzone__body">
      <strong className="ds-file-dropzone__label">{label}</strong>
      <p className="ds-file-dropzone__description">{description}</p>
      <button type="button" className="ds-file-dropzone__choose" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {chooseLabel}
      </button>
    </div>
  </div>
}
