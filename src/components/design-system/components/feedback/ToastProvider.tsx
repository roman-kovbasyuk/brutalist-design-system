import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { FeedbackTone } from './StatusBadge'

export type ToastInput = {
  title: ReactNode
  description?: ReactNode
  tone?: Exclude<FeedbackTone, 'neutral'>
}

type ToastRecord = ToastInput & { id: number }
type ToastContextValue = { toast: (input: ToastInput) => void; dismiss: (id: number) => void }
const ToastContext = createContext<ToastContextValue | null>(null)

/** Supplies a non-blocking, accessible toast region for an application root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const toast = useCallback((input: ToastInput) => setToasts(current => [...current, { ...input, id: Date.now() + current.length }]), [])
  const dismiss = useCallback((id: number) => setToasts(current => current.filter(item => item.id !== id)), [])
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return <ToastContext.Provider value={value}>{children}
    <div className="ds-toast-viewport" aria-label="Notifications" aria-live="polite">
      {toasts.map(item => <div key={item.id} className="ds-toast" data-tone={item.tone ?? 'info'} role="status">
        <div><strong>{item.title}</strong>{item.description && <div className="ds-toast__description">{item.description}</div>}</div>
        <button type="button" className="ds-toast__dismiss" aria-label={`Dismiss ${String(item.title)}`} onClick={() => dismiss(item.id)}><X size={16} aria-hidden="true" /></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
