import { Children } from 'react'
import { Copy } from 'lucide-react'
import { TokenCopyTarget } from '../atoms/TokenCopyTarget.jsx'
import './specimen-grid.css'

/** Bordered catalog cells; controls inside each cell retain their own behavior. */
export function SpecimenGridCells({ children }) {
  return Children.toArray(children).map((child, index) => {
    const reference = child.props?.['data-component-reference']
    return <div className="ds-specimen-grid__cell" data-component-reference={reference} key={child.key ?? index}>
      {child}
      {reference && <TokenCopyTarget className="ds-component-copy" copyValue={reference} label={reference}><Copy aria-hidden="true" size={14} /></TokenCopyTarget>}
    </div>
  })
}

export function SpecimenGrid({ as: Element = 'div', children, append, className = '', ...props }) {
  return <Element {...props} className={`ds-specimen-grid ${className}`.trim()}>
    <SpecimenGridCells>{children}</SpecimenGridCells>
    {append}
  </Element>
}
