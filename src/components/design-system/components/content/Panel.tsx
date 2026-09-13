import { useId, type HTMLAttributes, type ReactNode } from 'react'

export type PanelProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  as?: 'section' | 'div' | 'article'
  children?: ReactNode
}

/** A neutral wrapper for grouped content with a header and optional subheader. */
export function Panel({ title, description, as: Element = 'section', children, className = '', ...props }: PanelProps) {
  const titleId = useId()
  return <Element {...props} className={`ds-panel${children == null ? ' ds-panel--empty' : ''} ${className}`.trim()} aria-labelledby={titleId}>
    <div className="ds-panel__content">
      <header className="ds-panel__header">
        <h3 id={titleId}>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </div>
  </Element>
}
