import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'
import type { TagTone, TagVariant } from './Tag'

export type TagButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode
  tone?: TagTone
  variant?: TagVariant
  dismissible?: boolean
}

/** An interactive tag-shaped control that shares the canonical Tag treatment. */
export function TagButton({ children, tone = 'neutral', variant = 'filled', dismissible = false, className = '', ...props }: TagButtonProps) {
  return <button {...props} className={`ds-tag ds-tag-button ds-tag--${variant} ds-tag--${tone} ${className}`.trim()} data-tone={tone} data-variant={variant}>
    {children}
    {dismissible && <X className="ds-tag-button__dismiss" aria-hidden="true" size={14} strokeWidth={2.5} />}
  </button>
}
