import { Check, Plus } from 'lucide-react'
import './selection-tile.css'

/** Native toggle tile for visual choices. Children must be non-interactive.
 * Selection remains visible; affordances reveal on hover, focus, or touch.
 * Owns no fetching, domain identity, or selection limit.
 */
export function SelectionTile({ label, selected = false, onChange, disabled = false, children, caption, className = '' }) {
  return <button type="button" className={`v2-selection-tile ${className}`} aria-label={`${selected ? 'Deselect' : 'Select'} ${label}`}
    aria-pressed={selected} disabled={disabled} onClick={onChange}>
    <span className="v2-selection-tile__content">{children}</span>
    <span className="v2-selection-tile__action" aria-hidden="true">{selected ? <Check size={20} /> : <Plus size={20} />}</span>
    {caption && <span className="v2-selection-tile__caption">{caption}</span>}
  </button>
}
