import { describe, expect, test } from 'vitest'
import { entries } from '../registry/entries'
import { families } from '../registry/families'
import { formatRoute, parseRoute } from './route'

describe('workbench routes', () => {
  test('parses a direct link using the real registry', () => {
    const url = new URL('https://example.test/?section=components&family=buttons&example=primary&view=code')

    expect(parseRoute(url, families, entries)).toEqual({ section: 'components', family: 'buttons', example: 'primary', view: 'code' })
  })

  test('keeps a valid family open when its example or view is invalid', () => {
    const url = new URL('https://example.test/?section=components&family=buttons&example=missing&view=preview&unused=ignored')

    expect(parseRoute(url, families, entries)).toEqual({ section: 'components', family: 'buttons' })
  })

  test('formats routes through URLSearchParams and preserves the base path', () => {
    const url = formatRoute(
      { section: 'components', family: 'buttons', example: 'primary', view: 'code' },
      new URL('https://example.test/design-system?workbench=v2'),
    )

    expect(url.toString()).toBe('https://example.test/design-system?section=components&family=buttons&example=primary&view=code')
  })

  test('translates known catalog anchors and recovers from unknown anchors', () => {
    expect(parseRoute(new URL('https://example.test/#ds-preview-appbutton'), families, entries)).toEqual({ section: 'components', family: 'buttons', example: 'primary' })
    expect(parseRoute(new URL('https://example.test/#ds-typography'), families, entries)).toEqual({ section: 'basics', family: 'typography' })
    expect(parseRoute(new URL('https://example.test/#removed-preview'), families, entries)).toEqual({ section: 'basics' })
  })
})
