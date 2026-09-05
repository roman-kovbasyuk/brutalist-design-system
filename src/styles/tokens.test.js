import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('UI v2 tokens', () => {
  test('keeps secondary text at AA contrast on canvas and white while preserving the palette swatch', () => {
    const secondary = tokens.match(/--v2-text-secondary:\s*(#[\da-f]{6})/i)[1]
    const canvas = tokens.match(/--v2-canvas:\s*(#[\da-f]{6})/i)[1]
    const luminance = (hex) => hex.slice(1).match(/../g).map((channel) => {
      const value = parseInt(channel, 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
    for (const background of ['#ffffff', canvas]) {
      expect((luminance(background) + 0.05) / (luminance(secondary) + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
    expect(tokens).toContain('--v2-muted: rgba(0, 0, 0, 0.5)')
  })

  test('defines the approved Gumroad-inspired foundation', () => {
    expect(tokens).toContain('--v2-canvas: #f4f4f0')
    expect(tokens).toContain('--v2-accent: #79d9ff')
    expect(tokens).toContain('--v2-border: #000000')
    expect(tokens).toContain('--v2-radius: 4px')
    expect(tokens).toContain('--v2-shadow-interactive: 4px 4px 0 #000000')
    expect(tokens).toContain('--v2-duration-fast: 150ms')
  })
})
