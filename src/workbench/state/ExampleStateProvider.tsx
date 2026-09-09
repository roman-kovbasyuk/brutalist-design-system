import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import type { Values } from '../registry/types'
import { reduceExamples } from './exampleState'
import type { ExampleAction, ExampleState, ExampleStates } from './exampleState'

type ExampleStateContextValue = {
  examples: ExampleStates
  dispatch: (action: ExampleAction) => void
}

const ExampleStateContext = createContext<ExampleStateContextValue | null>(null)

export function ExampleStateProvider({ children, initialState = {} }: { children: ReactNode; initialState?: ExampleStates }) {
  const [examples, dispatch] = useReducer(reduceExamples, initialState)
  const value = useMemo(() => ({ examples, dispatch }), [examples])
  return <ExampleStateContext.Provider value={value}>{children}</ExampleStateContext.Provider>
}

export function useExampleState(key: string, initial: ExampleState) {
  const context = useContext(ExampleStateContext)
  if (!context) throw new Error('useExampleState must be used inside ExampleStateProvider')
  const state = context.examples[key] ?? initial
  useEffect(() => {
    context.dispatch({ type: 'register', key, initial })
  }, [context.dispatch, initial, key])
  return {
    state,
    setOptions: (patch: Values) => context.dispatch({ type: 'options', key, patch }),
    setDraft: (patch: Values) => context.dispatch({ type: 'draft', key, patch }),
    reset: () => context.dispatch({ type: 'reset', key, initial }),
  }
}
