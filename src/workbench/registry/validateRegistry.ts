import type { Control, EntryMetadata, Family, Value, Values } from './types'

function hasValidValue(control: Control, value: Value | undefined) {
  if (value === undefined) return false
  if (control.type === 'boolean') return typeof value === 'boolean'
  if (control.type === 'select') return typeof value === 'string' && control.choices.includes(value)
  return typeof value === 'string' && value.length <= control.maxLength
}

function validateValues(entryId: string, exampleId: string, controls: Control[], values: Values, label: 'default' | 'draft') {
  return controls.flatMap((control) => (
    Object.hasOwn(values, control.key) && !hasValidValue(control, values[control.key])
      ? [`Example "${exampleId}" in entry "${entryId}" has invalid ${label} for "${control.key}".`]
      : []
  ))
}

export function validateRegistry(families: Family[], entries: EntryMetadata[]) {
  const errors: string[] = []
  const familyIds = new Set<string>()
  const entryIds = new Set<string>()
  const exampleIdsByFamily = new Map<string, Set<string>>()

  for (const family of families) {
    if (familyIds.has(family.id)) errors.push(`Duplicate family ID "${family.id}".`)
    familyIds.add(family.id)
    if (family.groups.length === 0) errors.push(`Family "${family.id}" has no groups.`)
  }

  for (const entry of entries) {
    if (entryIds.has(entry.id)) errors.push(`Duplicate entry ID "${entry.id}".`)
    entryIds.add(entry.id)
    const family = families.find((item) => item.id === entry.familyId)
    if (!family) errors.push(`Entry "${entry.id}" references missing family "${entry.familyId}".`)
    if (entry.maturity === 'stable') errors.push(`Stable entry "${entry.id}" needs an evidence record.`)
    if (entry.examples.length === 0) errors.push(`Entry "${entry.id}" has no examples.`)

    const exampleIds = exampleIdsByFamily.get(entry.familyId) ?? new Set<string>()
    exampleIdsByFamily.set(entry.familyId, exampleIds)
    for (const example of entry.examples) {
      if (exampleIds.has(example.id)) errors.push(`Duplicate example ID "${example.id}" in family "${entry.familyId}".`)
      exampleIds.add(example.id)
      if (family && !family.groups.includes(example.group)) errors.push(`Example "${example.id}" in entry "${entry.id}" references missing group "${example.group}".`)
      errors.push(...validateValues(entry.id, example.id, example.controls, example.defaults, 'default'))
      errors.push(...validateValues(entry.id, example.id, example.controls, example.initialDraft, 'draft'))
    }
  }

  return errors
}
