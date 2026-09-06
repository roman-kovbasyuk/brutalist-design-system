import { useCallback, useMemo, useSyncExternalStore } from 'react'

const emptyActions = Object.freeze({})

/** Only the subscribed module's changed snapshot causes this hook to update. */
export function useCampaignModule(runtime, moduleId, actions = emptyActions, onNavigate) {
  const subscribe = useCallback(listener => runtime.subscribe(moduleId, listener), [runtime, moduleId])
  const getSnapshot = useCallback(() => runtime.getSnapshot(moduleId), [runtime, moduleId])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const setDirty = useCallback(value => runtime.setDirty(moduleId, value), [runtime, moduleId])
  const navigate = useCallback(id => onNavigate?.(id), [onNavigate])
  return useMemo(() => ({ ...snapshot, actions, assets: runtime.assets, setDirty, navigate }),
    [snapshot, actions, runtime, setDirty, navigate])
}
