import { describe, expect, test } from 'vitest'
import { reduceExamples } from './exampleState'

describe('reduceExamples', () => {
  test('registers an unseen specimen without overwriting a retained state', () => {
    const initial = { options: { variant: 'primary' }, draft: { label: 'Save' }, resetVersion: 0 }
    const registered = reduceExamples({}, { type: 'register', key: 'buttons/primary', initial })
    expect(registered['buttons/primary']).toEqual(initial)
    expect(reduceExamples(registered, { type: 'register', key: 'buttons/primary', initial })).toBe(registered)
  })

  test('keeps example values independent and only increments reset version for an explicit reset', () => {
    const initial = {
      'buttons/primary': { options: { variant: 'primary' }, draft: { label: 'Save' }, resetVersion: 0 },
      'buttons/danger': { options: { variant: 'danger' }, draft: { label: 'Delete' }, resetVersion: 0 },
    }

    const edited = reduceExamples(initial, { type: 'draft', key: 'buttons/primary', patch: { label: 'Publish' } })
    expect(edited['buttons/primary']).toEqual({ options: { variant: 'primary' }, draft: { label: 'Publish' }, resetVersion: 0 })
    expect(edited['buttons/danger']).toEqual(initial['buttons/danger'])

    const reset = reduceExamples(edited, {
      type: 'reset',
      key: 'buttons/primary',
      initial: { options: { variant: 'primary' }, draft: { label: 'Save' }, resetVersion: 0 },
    })
    expect(reset['buttons/primary']).toEqual({ options: { variant: 'primary' }, draft: { label: 'Save' }, resetVersion: 1 })
    expect(reset['buttons/danger']).toEqual(initial['buttons/danger'])
  })
})
