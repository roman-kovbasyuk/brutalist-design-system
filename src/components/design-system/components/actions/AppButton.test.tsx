import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AppButton } from './AppButton'

const actionsStyles = readFileSync(join(process.cwd(), 'src/components/design-system/components/actions/actions.css'), 'utf8')

test('quiet buttons do not underline their labels', () => {
  expect(actionsStyles).toMatch(/\.ds-button--quiet\s*{[^}]*text-decoration:\s*none;/)
})

test('quiet buttons use a one-pixel black hover stroke', () => {
  expect(actionsStyles).toMatch(/\.ds-button--quiet:not\(:disabled\):not\(\[aria-disabled='true'\]\):hover\s*{[^}]*border-color:\s*var\(--v2-ink\);/)
})

test('busy action links do not follow or invoke their click handler', async () => {
  const onClick = vi.fn()
  const user = userEvent.setup()

  render(<AppButton as="a" href="#next" busy onClick={onClick}>Continue</AppButton>)

  const link = screen.getByRole('link', { name: 'Continue' })
  expect(link).toHaveAttribute('aria-disabled', 'true')
  await user.click(link)
  expect(onClick).not.toHaveBeenCalled()
})

test('buttons keep their safe non-submit default', async () => {
  const onSubmit = vi.fn((event) => event.preventDefault())
  const user = userEvent.setup()

  render(<form onSubmit={onSubmit}><AppButton>Preview</AppButton></form>)

  await user.click(screen.getByRole('button', { name: 'Preview' }))
  expect(onSubmit).not.toHaveBeenCalled()
})

test('can hide the busy indicator while preserving the busy state', () => {
  render(<AppButton busy showBusyIndicator={false}>Generating…</AppButton>)

  expect(screen.getByRole('button', { name: 'Generating…' })).toHaveAttribute('aria-busy', 'true')
  expect(document.querySelector('.ds-button__spinner')).not.toBeInTheDocument()
})
