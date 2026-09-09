import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'

export type SelectionTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> & {
  label: string
  selected?: boolean
  onChange?: () => void
  caption?: ReactNode
  children: ReactNode
}

/** A pressable visual-choice tile. It owns only its single selection callback. */
export function SelectionTile({ label, selected = false, onChange, disabled = false, caption, children, className = '', ...props }: SelectionTileProps) {
  return <button {...props} type={props.type ?? 'button'} className={`ds-selection-tile ${className}`.trim()}
    aria-label={`${selected ? 'Deselect' : 'Select'} ${label}`} aria-pressed={selected} disabled={disabled} onClick={onChange}>
    <span className="ds-selection-tile__content">{children}</span>
    <span className="ds-selection-tile__action" aria-hidden="true">{selected ? <Check size={20} /> : <Plus size={20} />}</span>
    {caption && <span className="ds-selection-tile__caption">{caption}</span>}
  </button>
}
