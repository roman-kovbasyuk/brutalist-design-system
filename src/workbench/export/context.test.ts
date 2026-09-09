import { describe, expect, test } from 'vitest'
import { entries } from '../registry/entries'
import { exportContext, exportContextJson } from './context'

const entry = entries.find((item) => item.id === 'app-button')!
const example = entry.examples.find((item) => item.id === 'primary')!

describe('agent context export', () => {
  test('exports complete, product-independent Markdown from a registry record', () => {
    const result = exportContext(entry, example, example.defaults, '0.1.0')

    expect(result).toContain('Design system version: `0.1.0`')
    expect(result).toContain(entry.purpose)
    expect(result).toContain('import { AppButton } from \'@design-system\'')
    expect(result).toContain(example.getSource(example.defaults))
    expect(result).toContain(entry.usage)
    expect(result).toContain(entry.keyboard)
    expect(result).toContain(entry.constraints[0])
    expect(result).toContain(entry.maturity)
    expect(result).not.toContain('src/studio')
  })

  test('exports a serializable JSON context without renderer functions', () => {
    const result = JSON.parse(exportContextJson(entry, example, example.defaults, '0.1.0'))

    expect(result).toMatchObject({
      version: '0.1.0',
      component: 'AppButton',
      example: 'Primary',
      options: { variant: 'primary' },
      imports: ['AppButton'],
      source: example.getSource(example.defaults),
    })
    expect(result).not.toHaveProperty('Component')
  })

  test('rejects option keys and values outside the selected example contract', () => {
    expect(() => exportContext(entry, example, { variant: 'unsupported' }, '0.1.0')).toThrow('Unsupported value "unsupported" for option "variant".')
    expect(() => exportContext(entry, example, { invented: true }, '0.1.0')).toThrow('Unsupported option "invented".')
  })
})
