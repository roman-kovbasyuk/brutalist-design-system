import type { ComponentProps, CSSProperties } from 'react'

export type ContainerProps = ComponentProps<'div'> & { maxWidth?: number }

export function Container({ maxWidth = 1200, className = '', style, ...props }: ContainerProps) {
  return <div {...props} className={`ds-container ${className}`.trim()} style={{ ...style, '--ds-container-max': `${maxWidth}px` } as CSSProperties} />
}
