import type { ComponentProps } from 'react'

export type DividerProps = ComponentProps<'hr'>

export function Divider({ className = '', ...props }: DividerProps) {
  return <hr {...props} className={`ds-divider ${className}`.trim()} />
}
