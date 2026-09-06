import { describe, expect, test } from 'vitest'
import snapshots from './modulePlaygroundFixtures.json'
import { makeScenario } from './workspaceFixtures.js'

const names = ['draft', 'copy-ready', 'visuals-ready', 'composed', 'in-review', 'changes-requested', 'ready', 'approved', 'delivered']

describe('serialized browser playground fixtures', () => {
  test.each(names)('%s matches the Node fixture factory', name => {
    expect(snapshots[name]).toEqual(makeScenario(name))
  })
})
