import { useRef, type CSSProperties } from 'react'

export type CanvasTextProps = {
  label: string
  value: string
  onValueChange: (value: string) => void
  maxLength?: number
  required?: boolean
  readOnly?: boolean
  placeholder?: string
  className?: string
  style?: CSSProperties
}

/** Native plain-text editing within an artwork slot, without form chrome.
 * The parent owns the value; blur commits and Escape restores the focus snapshot. */
export function CanvasText({ label, value, onValueChange, maxLength, required = false,
  readOnly = false, placeholder, className = '', style }: CanvasTextProps) {
  const startValue = useRef(value)
  return <textarea className={`ds-canvas-text ${className}`.trim()} style={style}
    aria-label={label} aria-invalid={(required && !value.trim()) || (maxLength !== undefined && value.length > maxLength) || undefined}
    value={value} required={required} readOnly={readOnly}
    placeholder={placeholder} rows={1} spellCheck
    onFocus={() => { startValue.current = value }}
    onChange={event => { if (!readOnly) onValueChange(event.target.value) }}
    onBlur={event => { event.currentTarget.scrollTop = 0; event.currentTarget.scrollLeft = 0 }}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !readOnly) {
        event.preventDefault()
        onValueChange(startValue.current)
        event.currentTarget.blur()
      }
    }} />
}
