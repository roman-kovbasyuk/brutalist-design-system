import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/components/design-system/foundations/tokens.css'), 'utf8')
const definitions = Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]))
const resolve = (name) => definitions[name].replace(/var\((--[\w-]+)\)/g, (_, reference) => resolve(reference))
const luminance = (hex) => hex.slice(1).match(/../g).map((channel) => {
  const value = parseInt(channel, 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
const contrast = (a, b) => {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (high + 0.05) / (low + 0.05)
}

describe('application semantic tokens', () => {
  test('keeps text roles at AA contrast on their intended backgrounds', () => {
    for (const background of ['--v2-surface', '--v2-canvas']) {
      expect(contrast(resolve('--v2-text-secondary'), resolve(background))).toBeGreaterThanOrEqual(4.5)
    }
    for (const background of ['--v2-accent', '--v2-success']) {
      expect(contrast(resolve('--v2-ink'), resolve(background))).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast(resolve('--v2-surface'), resolve('--v2-danger'))).toBeGreaterThanOrEqual(4.5)
    expect(resolve('--v2-muted')).toBe('rgba(0, 0, 0, 0.5)')
  })

  test('preserves the current application palette and physical feedback contract', () => {
    expect(resolve('--v2-canvas')).toBe('#f4f4f0')
    expect(resolve('--v2-accent')).toBe('#79d9ff')
    expect(resolve('--v2-border')).toBe('#000000')
    expect(resolve('--v2-radius')).toBe('4px')
    expect(resolve('--v2-shadow-interactive')).toBe('4px 4px 0 #000000')
    expect(resolve('--v2-duration-fast')).toBe('150ms')
  })
})
