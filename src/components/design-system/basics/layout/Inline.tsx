import type { ComponentProps, CSSProperties } from 'react'
import { spaceVariable, type Space } from './types'

export type InlineProps = ComponentProps<'div'> & { gap?: Space }

export function Inline({ gap, className = '', style, ...props }: InlineProps) {
  return <div {...props} className={`ds-inline ${className}`.trim()} style={{ ...style, '--ds-gap': spaceVariable(gap) } as CSSProperties} />
}
