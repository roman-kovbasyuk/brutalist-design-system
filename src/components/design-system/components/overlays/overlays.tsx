import type { ReactElement, ReactNode } from 'react'
import { Dialog as DialogPrimitive, DropdownMenu, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui'

type OpenState = { open: boolean; onOpenChange: (open: boolean) => void }
type Trigger = string | ReactElement

function OverlayTrigger({ children, primitive: Primitive }: { children: Trigger; primitive: typeof DialogPrimitive.Trigger | typeof PopoverPrimitive.Trigger | typeof DropdownMenu.Trigger }) {
  return <Primitive asChild>{typeof children === 'string' ? <button className="ds-overlay-trigger" type="button">{children}</button> : children}</Primitive>
}

export type DialogProps = OpenState & {
  title: ReactNode
  description?: ReactNode
  trigger?: Trigger
  children: ReactNode
  closeLabel?: string
}

/** A controlled modal dialog with focus management supplied by Radix. */
export function Dialog({ open, onOpenChange, title, description, trigger, children, closeLabel = 'Close dialog' }: DialogProps) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    {trigger && <OverlayTrigger primitive={DialogPrimitive.Trigger}>{trigger}</OverlayTrigger>}
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ds-overlay-backdrop" />
      <DialogPrimitive.Content className="ds-dialog" aria-describedby={description ? undefined : undefined}>
        <div className="ds-overlay__header">
          <DialogPrimitive.Title className="ds-overlay__title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="ds-overlay__close" aria-label={closeLabel}>×</DialogPrimitive.Close>
        </div>
        {description && <DialogPrimitive.Description className="ds-overlay__description">{description}</DialogPrimitive.Description>}
        <div className="ds-overlay__body">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}

export type DrawerProps = DialogProps & { side?: 'left' | 'right' | 'top' | 'bottom' }

/** A controlled modal drawer. Its direction is presentational; its state stays with the consumer. */
export function Drawer({ side = 'right', open, onOpenChange, title, description, trigger, children, closeLabel }: DrawerProps) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    {trigger && <OverlayTrigger primitive={DialogPrimitive.Trigger}>{trigger}</OverlayTrigger>}
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ds-overlay-backdrop" />
      <DialogPrimitive.Content className={`ds-drawer ds-drawer--${side}`}>
        <div className="ds-overlay__header">
          <DialogPrimitive.Title className="ds-overlay__title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="ds-overlay__close" aria-label={closeLabel ?? 'Close drawer'}>×</DialogPrimitive.Close>
        </div>
        {description && <DialogPrimitive.Description className="ds-overlay__description">{description}</DialogPrimitive.Description>}
        <div className="ds-overlay__body">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}

export type PopoverProps = OpenState & {
  trigger: Trigger
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

/** A controlled, non-modal surface for contextual controls. */
export function Popover({ open, onOpenChange, trigger, children, side = 'bottom', align = 'start' }: PopoverProps) {
  return <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <OverlayTrigger primitive={PopoverPrimitive.Trigger}>{trigger}</OverlayTrigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content className="ds-popover" side={side} align={align} sideOffset={8}>{children}</PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>
}

export type TooltipProps = {
  content: ReactNode
  children: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}

/** A concise label for a control whose purpose is not visible from its name alone. */
export function Tooltip({ content, children, open, onOpenChange, side = 'top', delayDuration = 0 }: TooltipProps) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration}>
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="ds-tooltip" side={side} sideOffset={8}>{content}<TooltipPrimitive.Arrow className="ds-tooltip__arrow" /></TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
}

export type MenuItem = { id: string; label: ReactNode; icon?: ReactNode; disabled?: boolean; danger?: boolean }
export type MenuProps = OpenState & {
  trigger: Trigger
  items: MenuItem[]
  onSelect: (id: string) => void
  ariaLabel?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  className?: string
}

/** A controlled menu for an explicit, short list of actions. */
export function Menu({ open, onOpenChange, trigger, items, onSelect, ariaLabel = 'Actions', side = 'bottom', align = 'start', className = '' }: MenuProps) {
  return <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
    <OverlayTrigger primitive={DropdownMenu.Trigger}>{trigger}</OverlayTrigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={`ds-menu ${className}`.trim()} align={align} side={side} sideOffset={8} aria-label={ariaLabel}>
        {items.map((item) => <DropdownMenu.Item key={item.id} className={`ds-menu__item${item.danger ? ' ds-menu__item--danger' : ''}${item.icon ? ' ds-menu__item--with-icon' : ''}`} disabled={item.disabled} onSelect={() => onSelect(item.id)}>{item.icon && <span className="ds-menu__icon" aria-hidden="true">{item.icon}</span>}<span>{item.label}</span></DropdownMenu.Item>)}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}
