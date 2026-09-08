import { LoaderCircle } from 'lucide-react'
import '../../../styles/app-controls.css'

/** Shared app control. Banner artwork does not consume application styles. */
export function AppButton({ children, as: Component = 'button', variant = 'secondary', size = 'default', iconOnly = false, busy = false, disabled = false, className = '', type = 'button', ...props }) {
  const emphasis = variant === 'icon' ? 'secondary' : variant
  const controlProps = Component === 'button' ? { type, disabled: disabled || busy } : { 'aria-disabled': disabled || busy || undefined }
  return <Component {...props} {...controlProps} data-size={size} className={`v2-button v2-button--${emphasis}${iconOnly || variant === 'icon' ? ' v2-button--icon' : ''} ${className}`}
    aria-busy={busy || undefined}>
    {busy && <LoaderCircle size={16} className="v2-button-spinner" aria-hidden="true" />}
    {children}
  </Component>
}
