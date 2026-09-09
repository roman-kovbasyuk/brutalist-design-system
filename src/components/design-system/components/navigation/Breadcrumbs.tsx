import type { ReactNode } from 'react'

export type BreadcrumbItem = { label: ReactNode; href?: string }
export type BreadcrumbsProps = { items: BreadcrumbItem[]; ariaLabel?: string; className?: string }

/** A location trail whose final item identifies the current page. */
export function Breadcrumbs({ items, ariaLabel = 'Breadcrumb', className = '' }: BreadcrumbsProps) {
  return <nav className={`ds-breadcrumbs ${className}`.trim()} aria-label={ariaLabel}><ol>
    {items.map((item, index) => {
      const current = index === items.length - 1
      return <li key={index}>
        {index > 0 && <span className="ds-breadcrumbs__separator" aria-hidden="true">/</span>}
        {item.href && !current ? <a href={item.href}>{item.label}</a> : <span aria-current={current ? 'page' : undefined}>{item.label}</span>}
      </li>
    })}
  </ol></nav>
}
