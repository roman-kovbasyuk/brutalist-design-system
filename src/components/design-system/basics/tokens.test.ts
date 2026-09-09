import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { DesignSystemRoot } from './DesignSystemRoot'

const tokens = readFileSync('src/components/design-system/basics/tokens.css', 'utf8')

function resolveToken(name: string): string {
  const declaration = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(tokens)?.[1].trim()
  if (!declaration) throw new Error(`Missing token ${name}`)
  const reference = /^var\((--[^)]+)\)$/.exec(declaration)?.[1]
  return reference ? resolveToken(reference) : declaration
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map(channel => Number.parseInt(channel, 16) / 255)
  const [red, green, blue] = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return .2126 * red + .7152 * green + .0722 * blue
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + .05) / (darker + .05)
}

describe('design-system token contract', () => {
  test('renders a native div with the root class and caller props', () => {
    render(createElement(DesignSystemRoot, { className: 'catalog' }, 'Content'))
    expect(screen.getByText('Content')).toHaveClass('ds-root', 'catalog')
  })

  test('keeps all approved ordinary text pairs at WCAG AA contrast', () => {
    const pairs = [
      ['ink on canvas', resolveToken('--v2-ink'), resolveToken('--v2-canvas')],
      ['ink on surface', resolveToken('--v2-ink'), resolveToken('--v2-surface')],
      ['secondary text on canvas', resolveToken('--v2-text-secondary'), resolveToken('--v2-canvas')],
      ['secondary text on surface', resolveToken('--v2-text-secondary'), resolveToken('--v2-surface')],
      ['error text on canvas', resolveToken('--v2-error-text'), resolveToken('--v2-canvas')],
      ['error text on surface', resolveToken('--v2-error-text'), resolveToken('--v2-surface')],
    ] as const

    for (const [name, foreground, background] of pairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('declares portable semantic, elevation, and layering roles', () => {
    for (const role of [
      '--v2-action', '--v2-on-action', '--v2-on-danger', '--v2-on-success',
      '--v2-warning-text', '--v2-warning-surface', '--v2-warning-border',
      '--v2-shadow-small', '--v2-shadow-interactive', '--v2-shadow-floating',
      '--v2-z-popover', '--v2-z-modal', '--v2-z-toast',
    ]) {
      expect(tokens).toContain(role)
    }
  })
})
