import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { AppButton } from '../atoms/AppButton.jsx'
import '../action-card.css'

/** Mount when open. Native modal traps focus/inerts the page; close restores it. */
export function PreviewDialog({ title, onClose, children }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    dialog.showModal()
    return () => { dialog.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={dialogRef} className="v2-preview-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
    <header><h2 id={titleId}>{title}</h2><AppButton iconOnly aria-label="Close preview" onClick={onClose}><X size={20} aria-hidden="true" /></AppButton></header>
    {children}
  </dialog>
}
