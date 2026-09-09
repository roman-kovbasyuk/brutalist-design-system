import type { ComponentType } from 'react'

export type Section = 'basics' | 'components' | 'ui-blocks'
export type Value = string | number | boolean
export type Values = Record<string, Value>
export type View = 'options' | 'code' | 'usage'

export type Control =
  | { key: string; label: string; type: 'boolean'; shareable: boolean }
  | { key: string; label: string; type: 'select'; choices: string[]; shareable: boolean }
  | { key: string; label: string; type: 'text'; maxLength: number; shareable: false }

export type ExampleProps = {
  options: Values
  draft: Values
  onDraftChange(patch: Values): void
}

export type Example = {
  id: string
  title: string
  group: string
  defaults: Values
  initialDraft: Values
  controls: Control[]
  Component: ComponentType<ExampleProps>
  getSource(options: Values): string
}

export type Entry = {
  id: string
  familyId: string
  name: string
  purpose: string
  maturity: 'experimental' | 'beta' | 'stable' | 'deprecated'
  source: string
  exports: string[]
  dependencies: string[]
  tokens: string[]
  usage: string
  keyboard: string
  constraints: string[]
  examples: Example[]
}

export type EntryMetadata = Omit<Entry, 'examples'> & {
  examples: Omit<Example, 'Component'>[]
}

export type Family = {
  id: string
  section: Section
  title: string
  layout: 'swatches' | 'rows' | 'grid' | 'blocks'
  groups: string[]
}

export type Route = {
  section: Section
  family?: string
  example?: string
  view?: View
}
