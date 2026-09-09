import { createContext, useContext, useEffect, useState } from 'react'

const CopyModeContext = createContext({ enabled: true })
const storageKey = 'ds-click-to-copy'

export function CopyModeProvider({ children }) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'false' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(enabled)) } catch { /* Keep the toggle usable when storage is unavailable. */ }
  }, [enabled])
  return <CopyModeContext.Provider value={{ enabled, setEnabled }}>{children}</CopyModeContext.Provider>
}

export const useCopyMode = () => useContext(CopyModeContext)
