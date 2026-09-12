import type { HTMLAttributes, ReactNode } from 'react'

export type TagTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
export type TagVariant = 'filled' | 'outline'

export type TagProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  children: ReactNode
  tone?: TagTone
  variant?: TagVariant
}

/** A compact, display-only label with explicit visual and semantic tone. */
export function Tag({ children, tone = 'neutral', variant = 'filled', className = '', ...props }: TagProps) {
  return <span {...props} className={`ds-tag ds-tag--${variant} ds-tag--${tone} ${className}`.trim()} data-tone={tone} data-variant={variant}>
    {children}
  </span>
}
