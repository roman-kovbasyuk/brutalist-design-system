import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { AppButton } from './AppButton.jsx'
import './token-chip.css'

/** Copies the displayed CSS custom-property name, without a var() wrapper. */
export function TokenChip({ token }) {
  const [state, setState] = useState('idle')
  const timer = useRef(null)
  const request = useRef(0)

  useEffect(() => {
    setState('idle')
    return () => {
      request.current += 1
      clearTimeout(timer.current)
    }
  }, [token])

  async function copy() {
    const attempt = ++request.current
    clearTimeout(timer.current)
    setState('copying')
    try {
      await navigator.clipboard.writeText(token)
      if (request.current !== attempt) return
      setState('copied')
      timer.current = setTimeout(() => setState('idle'), 2000)
    } catch {
      if (request.current === attempt) setState('error')
    }
  }

  return <span className="v2-token-copy">
    <AppButton size="compact" className="v2-token-chip" aria-label={`Copy ${token}`}
      busy={state === 'copying'} onClick={copy}>
      <code>{token}</code>
      {state !== 'copying' && (state === 'copied'
        ? <Check size={16} aria-hidden="true" />
        : <Copy size={16} aria-hidden="true" />)}
    </AppButton>
    <span className="v2-token-copy__feedback" role="status" aria-atomic="true">
      {state === 'copied' ? `Copied ${token}` : state === 'error' ? `Could not copy ${token}. Try again.` : ''}
    </span>
  </span>
}
