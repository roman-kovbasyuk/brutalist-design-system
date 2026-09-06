import { useEffect, useState } from 'react'

/** Small keyed-list exit boundary. Pass a stable array with unique item.id keys.
 * Kept exits are display-only: consumers must mark them inert/aria-hidden.
 * The 200ms cleanup matches the disclosure token; reduced motion skips the exit.
 */
export function useExitPresence(items) {
  const [tracked, setTracked] = useState({ items, exits: [] })
  if (tracked.items !== items) {
    const ids = new Set(items.map(item => item.id))
    const exits = tracked.exits.filter(({ item }) => !ids.has(item.id))
    tracked.items.forEach((item, index) => {
      if (!ids.has(item.id) && !exits.some(exit => exit.item.id === item.id)) exits.push({ item, index })
    })
    setTracked({ items, exits })
  }
  useEffect(() => {
    if (!tracked.exits.length) return
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 200
    const timer = setTimeout(() => setTracked(current => ({ ...current, exits: [] })), delay)
    return () => clearTimeout(timer)
  }, [tracked.exits])
  const result = items.map(item => ({ item, exiting: false }))
  for (const exit of [...tracked.exits].sort((a, b) => a.index - b.index)) {
    result.splice(Math.min(exit.index, result.length), 0, { item: exit.item, exiting: true })
  }
  return result
}
