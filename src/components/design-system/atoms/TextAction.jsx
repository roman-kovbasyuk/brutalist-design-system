import { AppButton } from './AppButton.jsx'
import './text-action.css'

/** Low-emphasis text action with a small label and full keyboard/touch target. */
export function TextAction({ children, className = '', ...props }) {
  return <AppButton {...props} variant="quiet" size="compact" className={`v2-text-action ${className}`}>{children}</AppButton>
}
