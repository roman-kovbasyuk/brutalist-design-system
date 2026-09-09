import type { ReactNode } from 'react'

export type FileListProps = {
  /** Files supplied and owned by the caller. */
  files: readonly File[]
  onRemove?: (index: number) => void
  emptyMessage?: ReactNode
  className?: string
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${Math.round(value * 10) / 10} ${units[unit]}`
}

/** A presentational file list with a controlled remove callback. */
export function FileList({ files, onRemove, emptyMessage = 'No files selected.', className = '' }: FileListProps) {
  if (files.length === 0) return <p className={`ds-file-list__empty ${className}`.trim()}>{emptyMessage}</p>

  return <ul className={`ds-file-list ${className}`.trim()} aria-label="Selected files">
    {files.map((file, index) => <li className="ds-file-list__item" key={`${file.name}-${file.lastModified}-${index}`}>
      <span className="ds-file-list__details"><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></span>
      {onRemove && <button type="button" className="ds-file-list__remove" onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`}>Remove</button>}
    </li>)}
  </ul>
}
