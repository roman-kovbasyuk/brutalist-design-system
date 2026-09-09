import type { ComponentProps, CSSProperties } from 'react'
import { spaceVariable, type Space } from './types'

export type StackProps = ComponentProps<'div'> & { gap?: Space }

export function Stack({ gap, className = '', style, ...props }: StackProps) {
  return <div {...props} className={`ds-stack ${className}`.trim()} style={{ ...style, '--ds-gap': spaceVariable(gap) } as CSSProperties} />
}
