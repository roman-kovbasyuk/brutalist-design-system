import { useId, type ComponentProps, type ReactNode } from 'react'
import { Inline, Stack } from '../../basics/layout'

export type FormProps = ComponentProps<'form'>

/** Semantic form shell; the consumer owns validation, state, and submission. */
export function Form({ className = '', ...props }: FormProps) {
  return <form {...props} className={`ds-form ${className}`.trim()} />
}

export type FormSectionProps = ComponentProps<'fieldset'> & {
  title: string
  description?: ReactNode
  elevated?: boolean
  unstyled?: boolean
}

/** An accessible group of related fields with shared panel styling. */
export function FormSection({ title, description, children, elevated = false, unstyled = false, className = '', ...props }: FormSectionProps) {
  const descriptionId = useId()
  return <fieldset {...props} className={`ds-form-section${elevated ? ' ds-form-section--elevated' : ''}${unstyled ? ' ds-form-section--unstyled' : ''} ${className}`.trim()}
    aria-describedby={[props['aria-describedby'], description ? descriptionId : undefined].filter(Boolean).join(' ') || undefined}>
    <legend className="ds-form-section__title">{title}</legend>
    <Stack gap={4}>
      {description && <p className="ds-form-section__description" id={descriptionId}>{description}</p>}
      {children}
    </Stack>
  </fieldset>
}

export type FormActionsProps = ComponentProps<'footer'>

/** Wrapping action layout shared by forms at every viewport size. */
export function FormActions({ children, className = '', ...props }: FormActionsProps) {
  return <footer {...props} className={`ds-form-actions ${className}`.trim()}>
    <Inline gap={2} className="ds-form-actions__controls">{children}</Inline>
  </footer>
}
