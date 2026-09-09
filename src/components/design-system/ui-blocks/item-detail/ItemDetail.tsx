import { useRef } from 'react'
import type { ReactNode } from 'react'
import { FactGrid } from '../../components/content/FactGrid'
import { InlineText } from '../../components/content/InlineText'
import { ErrorState } from '../../components/feedback/ErrorState'
import { Skeleton } from '../../components/feedback/Skeleton'
import type { SaveResult } from '../../basics/types'

export type DetailItem = { id: string; revision: string; title: string; description: string }
export type ItemDetailProps = {
  item?: DetailItem; loading?: boolean; error?: string; onRetry?: () => void
  onSave: (patch: { title?: string; description?: string }, capturedRevision: string) => Promise<SaveResult>
  metadata?: ReactNode; preview?: ReactNode; actions?: ReactNode; readOnly?: boolean; className?: string
}

function ReadyDetail({ item, onSave, metadata, preview, actions, readOnly = false, className = '' }: Required<Pick<ItemDetailProps, 'item' | 'onSave'>> & Omit<ItemDetailProps, 'item' | 'onSave'>) {
  // A detail session keeps the revision it opened with, so a caller can reject stale edits.
  const capturedRevision = useRef(item.revision)
  const saveTitle = async (title: string) => {
    const result = await onSave({ title }, capturedRevision.current)
    if (!result.ok) throw new Error(result.message)
  }
  const saveDescription = async (description: string) => {
    const result = await onSave({ description }, capturedRevision.current)
    if (!result.ok) throw new Error(result.message)
  }
  return <article className={`ds-item-detail ${className}`.trim()} aria-labelledby={`item-detail-${item.id}`}>
    <header className="ds-item-detail__header">
      <div><p className="ds-item-detail__eyebrow">Item detail</p><h1 id={`item-detail-${item.id}`}>{item.title}</h1></div>
      {actions && <div className="ds-item-detail__actions">{actions}</div>}
    </header>
    <section className="ds-item-detail__body" aria-label="Item content">
      <div className="ds-item-detail__copy">
        <InlineText label="Title" value={item.title} onSave={saveTitle} readOnly={readOnly} required />
        <InlineText label="Description" value={item.description} onSave={saveDescription} readOnly={readOnly} multiline />
      </div>
      {preview && <section className="ds-item-detail__preview" aria-label="Preview">{preview}</section>}
    </section>
    <aside className="ds-item-detail__metadata" aria-label="Item metadata">
      <FactGrid label="Item facts" items={[{ id: 'revision', label: 'Revision', value: item.revision }]} />
      {metadata}
    </aside>
  </article>
}

/** A controlled detail block. The caller resolves versions, permissions and persistence. */
export function ItemDetail({ item, loading = false, error, onRetry, onSave, metadata, preview, actions, readOnly, className = '' }: ItemDetailProps) {
  if (loading) return <section className={`ds-item-detail ds-item-detail--loading ${className}`.trim()} aria-label="Loading item"><p role="status">Loading item…</p><Skeleton lines={4} /></section>
  if (error) return <ErrorState title={error} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} className={className} />
  if (!item) return <section className={`ds-item-detail ds-item-detail--empty ${className}`.trim()}><p>No item selected.</p></section>
  return <ReadyDetail key={item.id} item={item} onSave={onSave} metadata={metadata} preview={preview} actions={actions} readOnly={readOnly} className={className} />
}
