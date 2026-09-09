import type { ReactNode } from 'react'

/** The scalar values stored by portable selection controls. */
export type SelectionValue = string | number

export type SelectionOption<T extends SelectionValue> = {
  value: T
  label: ReactNode
  disabled?: boolean
}

export type SelectionControlProps<T extends SelectionValue> = {
  /** A visible label also used as the accessible name for the control. */
  label: string
  options: readonly SelectionOption<T>[]
  disabled?: boolean
  placeholder?: string
  className?: string
}
