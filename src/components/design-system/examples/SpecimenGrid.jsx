import { Children } from 'react'
import { TokenCopyTarget } from '../atoms/TokenCopyTarget.jsx'
import './specimen-grid.css'

/** Bordered catalog cells; controls inside each cell retain their own behavior. */
export function SpecimenGridCells({ children }) {
  return Children.toArray(children).map((child, index) => {
    const reference = child.props?.['data-component-reference']
    return <TokenCopyTarget surface component copyValue={reference} label={reference} className="ds-specimen-grid__cell" key={child.key ?? index}>
      {child}
    </TokenCopyTarget>
  })
}

export function SpecimenGrid({ as: Element = 'div', children, append, className = '', ...props }) {
  return <Element {...props} className={`ds-specimen-grid ${className}`.trim()}>
    <SpecimenGridCells>{children}</SpecimenGridCells>
    {append}
  </Element>
}
