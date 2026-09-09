import { useState } from 'react'
import { ItemDetail, type DetailItem } from './ItemDetail'

export function ItemDetailExample() {
  const [item, setItem] = useState<DetailItem>({ id: 'guide', revision: '1', title: 'Getting started guide', description: 'A practical introduction.' })
  async function save(patch: { title?: string; description?: string }, capturedRevision: string) {
    if (capturedRevision !== item.revision) return { ok: false as const, message: 'This item changed. Your edit is preserved.' }
    setItem((current) => ({ ...current, ...patch, revision: String(Number(current.revision) + 1) }))
    return { ok: true as const }
  }
  return <ItemDetail item={item} onSave={save} metadata={<p>Example content</p>} preview={<p>Preview slot</p>} />
}
