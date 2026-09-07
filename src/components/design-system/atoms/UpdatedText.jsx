import { useEffect, useRef, useState } from 'react'
import './updated-text.css'

/** Acknowledge a saved text change, never animate the initial value. */
export function useTextUpdate(value, identity) {
  const previous = useRef({ value, identity })
  const [updated, setUpdated] = useState(false)
  useEffect(() => {
    const changed = previous.current.identity === identity && previous.current.value !== value
    previous.current = { value, identity }
    setUpdated(changed)
    if (changed) {
      const timer = setTimeout(() => setUpdated(false), 200)
      return () => clearTimeout(timer)
    }
  }, [value, identity])
  return updated
}

export function UpdatedText({ value, identity }) {
  const updated = useTextUpdate(value, identity)
  return <span className="v2-updated-text" data-updated={updated || undefined}>{value}</span>
}
