import type { Values } from '../registry/types'

export type ExampleState = {
  options: Values
  draft: Values
  resetVersion: number
}

export type ExampleAction =
  | { type: 'register'; key: string; initial: ExampleState }
  | { type: 'options'; key: string; patch: Values }
  | { type: 'draft'; key: string; patch: Values }
  | { type: 'reset'; key: string; initial: ExampleState }

export type ExampleStates = Record<string, ExampleState>

/** Changes only the addressed specimen, so gallery previews retain their own drafts. */
export function reduceExamples(state: ExampleStates, action: ExampleAction): ExampleStates {
  const current = state[action.key]
  if (action.type === 'register') {
    return current ? state : { ...state, [action.key]: { options: { ...action.initial.options }, draft: { ...action.initial.draft }, resetVersion: action.initial.resetVersion } }
  }
  if (action.type === 'reset') {
    return {
      ...state,
      [action.key]: {
        options: { ...action.initial.options },
        draft: { ...action.initial.draft },
        resetVersion: (current?.resetVersion ?? action.initial.resetVersion) + 1,
      },
    }
  }
  if (!current) return state

  return {
    ...state,
    [action.key]: action.type === 'options'
      ? { ...current, options: { ...current.options, ...action.patch } }
      : { ...current, draft: { ...current.draft, ...action.patch } },
  }
}
