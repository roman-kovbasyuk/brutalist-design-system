import type { ComponentProps } from 'react'
import { AppButton } from './AppButton'

export function TextAction({ children, className = '', ...props }: ComponentProps<typeof AppButton>) {
  return <AppButton {...props} variant="quiet" size="compact" className={`ds-text-action ${className}`}>{children}</AppButton>
}
