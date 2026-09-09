import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('raises the specimen card while the calendar popover is open', () => {
  const stylesheet = readFileSync('src/styles/design-system.css', 'utf8')
  expect(stylesheet).toMatch(
    /\.system-screen--v2\.ds-catalog \.ds-components \.v2-specimen-card:has\(:is\(\.v2-floating-listbox, \.v2-date-picker__popover\)\)\s*\{[^}]*z-index:\s*20/
  )
})

test('keeps calendar dates on one line with compact cell spacing', () => {
  const stylesheet = readFileSync('src/styles/design-system.css', 'utf8')
  expect(stylesheet).toMatch(
    /\.system-screen--v2 \.v2-date-picker__days button\s*\{[^}]*padding:\s*0;[^}]*white-space:\s*nowrap/
  )
})
