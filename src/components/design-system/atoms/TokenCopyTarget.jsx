import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { AppButton } from './AppButton.jsx'
import { useCopyMode } from './CopyMode.jsx'
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
export function TokenCopyTarget({ copyValue, label, children, className = '', inline = false, preview = undefined, id = undefined, surface = false, style = undefined, chip = false, component = false }) {
  const { enabled } = useCopyMode()
  const [state, setState] = useState('idle')
  const [pointer, setPointer] = useState({ active: false, x: 0, y: 0 })
  const timer = useRef(null)
  const request = useRef(0)
  const [copiedValue, setCopiedValue] = useState(null)

  useEffect(() => {
    if (enabled) return
    request.current += 1
    clearTimeout(timer.current)
    setState('idle')
    setPointer(current => ({ ...current, active: false }))
  }, [enabled])

  function referenceAt(target) {
    if (!surface) return copyValue
    const sample = target.closest('[data-component-reference]')
    return sample?.dataset.componentReference || copyValue
  }

  function copyValueAt(target) {
    const reference = referenceAt(target)
    return component ? `Use this component ${reference} from the app design system (brutalist design system)` : reference
  }

  useEffect(() => () => {
    request.current += 1
    clearTimeout(timer.current)
  }, [])

  async function copy(event) {
    if (!enabled) return
    const attempt = ++request.current
    clearTimeout(timer.current)
    setState('copying')
    try {
      const value = copyValueAt(event.target)
      await copyText(value)
      if (request.current !== attempt) return
      setCopiedValue(value)
      setState('copied')
      timer.current = setTimeout(() => setState('idle'), 1800)
    } catch {
      if (request.current === attempt) setState('error')
    }
  }

  function isPreviewControl(target) {
    return (preview || surface) && target.closest('button, input, textarea, select, a, label, summary, [role="button"], [role="radio"], [role="switch"], [contenteditable="true"]') && !target.closest('.v2-token-copy-target__button')
  }

  function handlePointerMove(event) {
    if (!enabled) return
    if (surface && event.target.closest('.v2-token-copy-target') !== event.currentTarget) {
      setPointer(current => ({ ...current, active: false }))
      return
    }
    setPointer({ active: event.pointerType !== 'touch', x: event.clientX, y: event.clientY, value: copyValueAt(event.target), interactive: Boolean(isPreviewControl(event.target)) })
  }

  const Wrapper = surface ? 'div' : preview ? 'article' : 'span'


  return <Wrapper id={id} style={style} data-copy-enabled={enabled} className={`v2-token-copy-target${inline ? ' v2-token-copy-target--inline' : ''} ${className}`.trim()}
    onClick={preview || surface ? (event) => { if (surface && event.target.closest('.v2-token-copy-target') !== event.currentTarget) return; if (!isPreviewControl(event.target) && !event.target.closest('.v2-token-copy-target__button')) copy(event) } : undefined}
    onPointerMove={handlePointerMove} onPointerEnter={handlePointerMove} onPointerLeave={() => setPointer(current => ({ ...current, active: false }))}>
    {surface ? children : <AppButton variant={chip ? 'secondary' : 'quiet'} size="compact" className={chip ? 'v2-token-chip' : 'v2-token-copy-target__button'}
      aria-label={`Copy ${label}`} aria-busy={state === 'copying' || undefined} disabled={state === 'copying'}
      aria-disabled={!enabled || undefined} tabIndex={enabled ? undefined : -1}
      onFocus={event => {
        if (!enabled || pointer.active) return
        const rect = event.currentTarget.getBoundingClientRect()
        setPointer({ active: true, keyboard: true, x: rect.left + rect.width / 2, y: rect.bottom, value: component ? `Use this component ${copyValue} from the app design system (brutalist design system)` : copyValue })
      }}
      onBlur={() => setPointer(current => current.keyboard ? { ...current, active: false } : current)}
      onClick={copy}>
      {children}
    </AppButton>}
    {preview}
    {createPortal(<span className={`v2-token-copy-target__feedback${enabled && pointer.active ? ' v2-token-copy-target__feedback--visible' : ''}`.trim()}
      role="status" aria-atomic="true" style={{ '--copy-x': `${pointer.x}px`, '--copy-y': `${pointer.y}px` }}>
      {enabled && pointer.active && (state === 'copied' && copiedValue === pointer.value && !pointer.interactive ? <><Check size={14} aria-hidden="true" /> Copied</> : state === 'error' ? 'Could not copy. Try again.' : pointer.value)}
    </span>, document.body)}
  </Wrapper>
}
