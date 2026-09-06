import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppButton } from './AppButton.jsx'

test('blocks duplicate actions while busy and restores the action when idle', () => {
  const onClick = vi.fn()
  const { rerender } = render(<AppButton busy onClick={onClick}>Generate image</AppButton>)
  const button = screen.getByRole('button', { name: 'Generate image' })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
  fireEvent.click(button)
  expect(onClick).not.toHaveBeenCalled()
  rerender(<AppButton onClick={onClick}>Generate image</AppButton>)
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledOnce()
})

test('does not submit a form unless explicitly used as a submit button', () => {
  const submit = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submit}><AppButton>Preview</AppButton><AppButton type="submit">Save</AppButton></form>)
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(submit).toHaveBeenCalledOnce()
})
