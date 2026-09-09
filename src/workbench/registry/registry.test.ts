import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { metadata } from './metadata'
import { families } from './families'
import { validateRegistry } from './validateRegistry'
import type { EntryMetadata, Family } from './types'

describe('design-system registry', () => {
  test('documents the available registry without requiring browser renderers', () => {
    expect(validateRegistry(families, metadata)).toEqual([])
  })

  test('covers every portable component and UI-block family with a real example', () => {
    const expectedFamilies = [
      'inputs', 'selection', 'navigation', 'overlays', 'feedback', 'data', 'files',
      'ai', 'content', 'settings', 'app-layout', 'item-browser', 'item-detail', 'ai-workspace',
    ]
    const coveredFamilies = new Set(metadata.map((entry) => entry.familyId))
    for (const familyId of expectedFamilies) expect(coveredFamilies).toContain(familyId)
    for (const entry of metadata) expect(entry.examples.length, entry.id).toBeGreaterThan(0)
  })

  test('keeps documented source paths and exports accurate without importing browser modules', () => {
    for (const entry of metadata) {
      const sourcePath = resolve(process.cwd(), entry.source)
      expect(existsSync(sourcePath), `${entry.id} source`).toBe(true)
      const source = readFileSync(sourcePath, 'utf8')
      for (const exportedName of entry.exports) {
        expect(source).toMatch(new RegExp(`export\\s+(?:function|const|class)\\s+${exportedName}\\b`))
      }
      expect(entry.tokens.length, `${entry.id} tokens`).toBeGreaterThan(0)
      for (const token of entry.tokens) expect(token, `${entry.id} token`).toMatch(/^--v2-/)
    }
  })

  test('reports IDs, missing family groups, unsupported option values, and empty examples', () => {
    const testFamilies: Family[] = [
      { id: 'buttons', section: 'components', title: 'Buttons', layout: 'grid', groups: ['Emphasis'] },
    ]
    const entries: EntryMetadata[] = [
      {
        id: 'button', familyId: 'buttons', name: 'Button', purpose: 'Trigger work.', maturity: 'beta',
        source: 'src/Button.tsx', exports: ['Button'], dependencies: [], tokens: [], usage: 'Use it.', keyboard: 'Enter.', constraints: [],
        examples: [{ id: 'primary', title: 'Primary', group: 'Missing group', defaults: { variant: 'tertiary' }, initialDraft: {}, controls: [{ key: 'variant', label: 'Variant', type: 'select', choices: ['primary'], shareable: true }], getSource: () => '' }],
      },
      {
        id: 'button', familyId: 'unknown', name: 'Button again', purpose: 'Duplicate.', maturity: 'beta',
        source: 'src/Button.tsx', exports: ['Button'], dependencies: [], tokens: [], usage: 'Use it.', keyboard: 'Enter.', constraints: [], examples: [],
      },
    ]

    expect(validateRegistry(testFamilies, entries)).toEqual([
      'Example "primary" in entry "button" references missing group "Missing group".',
      'Example "primary" in entry "button" has invalid default for "variant".',
      'Duplicate entry ID "button".',
      'Entry "button" references missing family "unknown".',
      'Entry "button" has no examples.',
    ])
  })
})
