import type { ComponentProps } from 'react'

export type SurfaceProps = ComponentProps<'div'> & { tone?: 'canvas' | 'surface' }

export function Surface({ tone = 'surface', className = '', ...props }: SurfaceProps) {
  return <div {...props} className={`ds-surface ds-surface--${tone} ${className}`.trim()} />
}
