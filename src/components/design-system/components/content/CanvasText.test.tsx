import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as content from './index'

function Harness({ readOnly = false, maxLength = 40 }) {
  const [value, setValue] = useState('Hello world')
  const CanvasText = content.CanvasText
  return <><CanvasText label="Headline" value={value} onValueChange={setValue} maxLength={maxLength} readOnly={readOnly} /><output>{value}</output><button>Next</button></>
}

describe('CanvasText', () => {
  it('exposes the reusable artwork editing control', () => {
    expect(content.CanvasText).toBeTypeOf('function')
  })
  it('updates shared copy live and preserves a middle-of-text caret', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: 'Headline' }) as HTMLTextAreaElement
    await user.click(input)
    input.setSelectionRange(5, 5)
    await user.keyboard(' bright')
    expect(input).toHaveValue('Hello bright world')
    expect(screen.getByRole('status')).toHaveTextContent('Hello bright world')
    expect(input.selectionStart).toBe(12)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(input).toHaveValue('Hello bright world')
  })
  it('restores only the current edit session on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: 'Headline' })
    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Saved on blur')
    await user.tab()
    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Discard me{Escape}')
    expect(input).toHaveValue('Saved on blur')
    expect(input).not.toHaveFocus()
  })
  it('keeps pasted markup as text and preserves over-limit input for correction', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness maxLength={40} />)
    const input = screen.getByRole('textbox', { name: 'Headline' })
    await user.click(input)
    await user.clear(input)
    await user.paste('<b>Plain copy</b>')
    expect(input).toHaveValue('<b>Plain copy</b>')
    expect(container.querySelector('b')).toBeNull()
    await user.type(input, 'x'.repeat(50))
    expect(input).toHaveValue('<b>Plain copy</b>' + 'x'.repeat(50))
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
  it('does not publish edits when read-only', () => {
    render(<Harness readOnly />)
    const input = screen.getByRole('textbox', { name: 'Headline' })
    fireEvent.change(input, { target: { value: 'Changed' } })
    expect(screen.getByRole('status')).toHaveTextContent('Hello world')
    expect(input).toHaveAttribute('readonly')
  })
})
