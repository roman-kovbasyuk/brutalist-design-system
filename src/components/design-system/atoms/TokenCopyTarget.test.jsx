import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { TokenCopyTarget } from './TokenCopyTarget.jsx'

it('tracks the pointer and copies from a specimen cell while preserving live controls', async () => {
  const user = userEvent.setup()
  render(<TokenCopyTarget surface copyValue="components-fields" label="Fields">
    <div className="ds-specimen-grid__cell" data-component-reference="Text input"><span>Sample area</span><input id="example-field" aria-label="Example" /></div>
    <TokenCopyTarget copyValue="nested-id" label="Nested" inline>Nested name</TokenCopyTarget>
  </TokenCopyTarget>)
  await user.pointer({ target: screen.getByText('Sample area'), coords: { clientX: 140, clientY: 90 } })
  const feedback = screen.getAllByRole('status')[1]
  expect(feedback.textContent).toBe('Text input')
  expect(feedback.style.getPropertyValue('--copy-x')).toBe('140px')
  await user.click(screen.getByText('Sample area'))
  expect(await navigator.clipboard.readText()).toBe('Text input')
  await user.type(screen.getByRole('textbox'), 'Hello')
  expect(screen.getByRole('textbox').value).toBe('Hello')
  expect(await navigator.clipboard.readText()).toBe('Text input')
  await user.click(screen.getByRole('button', { name: 'Copy Nested' }))
  await waitFor(async () => expect(await navigator.clipboard.readText()).toBe('nested-id'))
})
