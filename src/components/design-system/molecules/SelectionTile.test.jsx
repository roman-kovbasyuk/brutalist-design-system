import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SelectionTile } from './SelectionTile.jsx'

it('uses a native button to expose selection, supports activation and disabled state', () => {
  const onChange = vi.fn()
  const view = render(<SelectionTile label="Editorial split" selected={false} onChange={onChange}><span>Preview</span></SelectionTile>)
  fireEvent.click(screen.getByRole('button', { name: 'Select Editorial split' }))
  expect(onChange).toHaveBeenCalledTimes(1)
  view.rerender(<SelectionTile label="Editorial split" selected onChange={onChange} disabled><span>Preview</span></SelectionTile>)
  const button = screen.getByRole('button', { name: 'Deselect Editorial split' })
  expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(onChange).toHaveBeenCalledTimes(1)
})
