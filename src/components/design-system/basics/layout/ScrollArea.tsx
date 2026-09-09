import type { ComponentProps } from 'react'

export type ScrollAreaProps = Omit<ComponentProps<'div'>, 'aria-label' | 'role'> & { label: string }

export function ScrollArea({ label, className = '', tabIndex, ...props }: ScrollAreaProps) {
  return <div {...props} aria-label={label} className={`ds-scroll-area ${className}`.trim()} role="region" tabIndex={tabIndex ?? 0} />
}
