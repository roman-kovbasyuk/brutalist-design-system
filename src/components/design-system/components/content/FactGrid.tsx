import type { ReactNode } from 'react'

export type FactGridItem = {
  id: string
  label: ReactNode
  value: ReactNode
  emphasis?: boolean
}

export type FactGridProps = {
  items: FactGridItem[]
  label?: string
  className?: string
  theme?: 'light' | 'dark' | 'system'
  density?: 'comfortable' | 'compact'
}

/** A responsive definition list for compact, labelled facts. */
export function FactGrid({ items, label = 'Details', className = '', theme, density = 'comfortable' }: FactGridProps) {
  return <div className={`ds-fact-grid-container ${className}`.trim()} role="group" aria-label={label} data-theme={theme} data-density={density}>
    <dl className="ds-fact-grid">
      {items.map(({ id, label: itemLabel, value, emphasis }) => <div key={id} data-emphasis={emphasis || undefined}>
        <dt>{itemLabel}</dt><dd>{value}</dd>
      </div>)}
    </dl>
  </div>
}
