import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { DesignSystemScreen } from '../../screens/DesignSystemScreen.jsx'
import { TokenCopyTarget } from './atoms/TokenCopyTarget.jsx'
import { TokenChip } from './atoms/TokenChip.jsx'

afterEach(() => vi.restoreAllMocks())

test('copies the visible token chip with keyboard activation and confirms success', async () => {
  const user = userEvent.setup()
  render(<TokenChip token="--v2-text-h1" />)
  const chip = screen.getByRole('button', { name: 'Copy --v2-text-h1' })
  chip.focus()
  await user.keyboard('{Enter}')
  expect(await navigator.clipboard.readText()).toBe('--v2-text-h1')
  expect(await screen.findByText('Copied --v2-text-h1')).toBeInTheDocument()
})

test('copies a hidden visual target value and confirms without exposing the token', async () => {
  const user = userEvent.setup()
  render(<TokenCopyTarget copyValue="--v2-accent" label="Accent token"><span>Accent swatch</span></TokenCopyTarget>)
  const target = screen.getByRole('button', { name: 'Copy Accent token' })
  expect(target).not.toHaveTextContent('--v2-accent')
  await user.click(target)
  expect(await navigator.clipboard.readText()).toBe('--v2-accent')
  expect(await screen.findByText('Copied')).toBeInTheDocument()
})

test('reports clipboard denial for a hidden color target and allows retry', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Clipboard denied'))
  render(<TokenCopyTarget copyValue="--v2-accent" label="Accent token"><span>Accent swatch</span></TokenCopyTarget>)
  const target = screen.getByRole('button', { name: 'Copy Accent token' })
  await user.click(target)
  expect(await screen.findByText('Could not copy. Try again.')).toBeVisible()
  expect(screen.queryByText('Copied')).not.toBeInTheDocument()
  write.mockRestore()
  await user.click(target)
  expect(await navigator.clipboard.readText()).toBe('--v2-accent')
  expect(await screen.findByText('Copied')).toBeInTheDocument()
})

test('copies one combined typography token from the visual sample', async () => {
  const user = userEvent.setup()
  const value = 'font: var(--v2-weight-heading) var(--v2-text-h1) / var(--v2-line-h1) var(--v2-font);'
  render(<TokenCopyTarget copyValue={value} label="H1 typography token"><span>Make creative work clear.</span></TokenCopyTarget>)
  await user.click(screen.getByRole('button', { name: 'Copy H1 typography token' }))
  expect(await navigator.clipboard.readText()).toBe(value)
})
