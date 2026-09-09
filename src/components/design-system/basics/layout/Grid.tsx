import type { ComponentProps, CSSProperties } from 'react'
import { spaceVariable, type Space } from './types'

export type GridProps = ComponentProps<'div'> & {
  gap?: Space
  minItemWidth?: number
}

export function Grid({ gap, minItemWidth = 280, className = '', style, ...props }: GridProps) {
  return <div {...props} className={`ds-grid ${className}`.trim()} style={{ ...style, '--ds-gap': spaceVariable(gap), '--ds-grid-min': `${minItemWidth}px` } as CSSProperties} />
}
