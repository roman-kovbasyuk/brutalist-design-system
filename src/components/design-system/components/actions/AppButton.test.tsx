import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AppButton } from './AppButton'

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
