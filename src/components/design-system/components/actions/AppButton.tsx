import { LoaderCircle } from 'lucide-react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'

type SharedProps = {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet' | 'icon'
  size?: 'default' | 'compact' | 'small'
  iconOnly?: boolean
  busy?: boolean
  showBusyIndicator?: boolean
  disabled?: boolean
  className?: string
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>
}

type ButtonProps = SharedProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedProps | 'disabled'> & {
  as?: 'button'
}

type AnchorProps = SharedProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedProps | 'onClick'> & {
  as: 'a'
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

export type AppButtonProps = ButtonProps | AnchorProps

/** A tactile action button with consistent pending and disabled behavior. */
export function AppButton(props: AppButtonProps) {
  if (props.as === 'a') {
    const {
      children,
      as: _as,
      variant = 'secondary',
      size = 'default',
      iconOnly = false,
      busy = false,
      showBusyIndicator = true,
      disabled = false,
      className = '',
      ref,
      onClick,
      ...rest
    } = props
    const inactive = busy || disabled
    const emphasis = variant === 'icon' ? 'secondary' : variant
    const classes = [
      'ds-button',
      `ds-button--${emphasis}`,
      (iconOnly || variant === 'icon') && 'ds-button--icon',
      className,
    ].filter(Boolean).join(' ')
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (inactive) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      onClick?.(event)
    }

    return <a {...rest} ref={ref as Ref<HTMLAnchorElement>} className={classes} data-size={size} aria-busy={busy || undefined}
      aria-disabled={inactive || undefined} tabIndex={inactive ? -1 : rest.tabIndex} onClick={handleClick}>{busy && showBusyIndicator && <LoaderCircle size={16} className="ds-button__spinner" aria-hidden="true" />}{children}</a>
  }

  const {
    children,
    variant = 'secondary',
    size = 'default',
    iconOnly = false,
    busy = false,
    showBusyIndicator = true,
    disabled = false,
    className = '',
    ref,
    onClick,
    ...rest
  } = props
  const inactive = busy || disabled
  const emphasis = variant === 'icon' ? 'secondary' : variant
  const classes = [
    'ds-button',
    `ds-button--${emphasis}`,
    (iconOnly || variant === 'icon') && 'ds-button--icon',
    className,
  ].filter(Boolean).join(' ')

  return <button {...rest} ref={ref as Ref<HTMLButtonElement>} type={props.type ?? 'button'} className={classes} data-size={size}
    aria-busy={busy || undefined} disabled={inactive} onClick={onClick}>{busy && showBusyIndicator && <LoaderCircle size={16} className="ds-button__spinner" aria-hidden="true" />}{children}</button>
}
