import type { ComponentProps } from 'react'

export function DesignSystemRoot({ className = '', ...props }: ComponentProps<'div'>) {
  return <div {...props} className={`ds-root ${className}`.trim()} />
}
