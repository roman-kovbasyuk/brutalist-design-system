import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { AppButton } from './AppButton.jsx'
import './token-copy-target.css'

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const fallback = document.createElement('textarea')
  fallback.value = value
  fallback.setAttribute('readonly', '')
  fallback.style.position = 'fixed'
  fallback.style.opacity = '0'
  document.body.appendChild(fallback)
  fallback.select()
  const copied = document.execCommand?.('copy')
  fallback.remove()
  if (!copied) throw new Error('Clipboard unavailable')
}

/** A visual token sample that copies an exact value without showing the token name. */
export function TokenCopyTarget({ copyValue, label, children, className = '', inline = false }) {
  const [state, setState] = useState('idle')
  const [pointer, setPointer] = useState({ active: false, x: 0, y: 0 })
  const timer = useRef(null)
  const request = useRef(0)

  useEffect(() => () => {
    request.current += 1
    clearTimeout(timer.current)
  }, [])

  async function copy() {
    const attempt = ++request.current
    clearTimeout(timer.current)
    setState('copying')
    try {
      await copyText(copyValue)
      if (request.current !== attempt) return
      setState('copied')
      timer.current = setTimeout(() => setState('idle'), 1800)
    } catch {
      if (request.current === attempt) setState('error')
    }
  }

  function handlePointerMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    setPointer({ active: true, x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }

  return <span className={`v2-token-copy-target${inline ? ' v2-token-copy-target--inline' : ''} ${className}`.trim()}>
    <AppButton variant="quiet" size="compact" className="v2-token-copy-target__button"
      aria-label={`Copy ${label}`} aria-busy={state === 'copying' || undefined} disabled={state === 'copying'}
      onClick={copy} onPointerMove={handlePointerMove} onPointerEnter={handlePointerMove} onPointerLeave={() => setPointer(current => ({ ...current, active: false }))}>
      {children}
    </AppButton>
    <span className={`v2-token-copy-target__feedback${pointer.active || state === 'copied' || state === 'error' ? ' v2-token-copy-target__feedback--visible' : ''}`.trim()}
      role="status" aria-atomic="true" style={{ '--copy-x': `${pointer.x}px`, '--copy-y': `${pointer.y}px` }}>
      {state === 'copied' ? <><Check size={14} aria-hidden="true" /> Copied</> : state === 'error' ? 'Could not copy. Try again.' : pointer.active ? 'Copy' : ''}
    </span>
  </span>
}
