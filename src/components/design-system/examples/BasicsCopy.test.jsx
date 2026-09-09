import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { BasicsCatalog } from './BasicsCatalog.jsx'
import { TokenChip } from '../atoms/TokenChip.jsx'

vi.mock('../basics/tokens.css?raw', async () => {
  const { readFileSync } = await import('node:fs')
  return { default: readFileSync('src/components/design-system/basics/tokens.css', 'utf8') }
})

it('shows the exact token over the whole color swatch and copies it', async () => {
  const user = userEvent.setup()
  render(<BasicsCatalog />)
  const swatch = screen.getByRole('button', { name: 'Copy Accent token' }).closest('.v2-color-swatch')
  await user.hover(swatch)
  expect(document.querySelector('.v2-token-copy-target__feedback--visible').textContent).toBe('--v2-accent')
  await user.click(swatch)
  expect(await navigator.clipboard.readText()).toBe('--v2-accent')
})

it('uses the same named hover and clipboard behavior for token chips', async () => {
  const user = userEvent.setup()
  render(<TokenChip token="--v2-accent" />)
  const button = screen.getByRole('button', { name: 'Copy --v2-accent' })
  await user.hover(button)
  expect(document.querySelector('.v2-token-copy-target__feedback--visible').textContent).toBe('--v2-accent')
  await user.click(button)
  expect(await navigator.clipboard.readText()).toBe('--v2-accent')
})
