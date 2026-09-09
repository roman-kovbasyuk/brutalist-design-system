import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CheckboxField } from './CheckboxField'
import { RadioGroup } from './RadioGroup'
import { SelectField } from './SelectField'
import { SwitchField } from './SwitchField'
import { TextArea } from './TextArea'
import { TextField } from './TextField'

describe('portable form controls', () => {
  it('connects a text field to its label, instructions, and error', () => {
    render(<TextField label="Campaign name" instructions="Use a clear working title." error="A name is required." />)

    const field = screen.getByRole('textbox', { name: 'Campaign name' })
    const description = field.getAttribute('aria-describedby')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(description).toBeTruthy()
    expect(description).toContain('-instructions')
    expect(description).toContain('-error')
    expect(screen.getByText('Use a clear working title.')).toHaveAttribute('id', expect.stringContaining('-instructions'))
    expect(screen.getByRole('alert')).toHaveTextContent('A name is required.')
  })

  it('keeps textarea labels and helper text associated', () => {
    render(<TextArea label="Notes" instructions="Visible to collaborators." />)

    const field = screen.getByRole('textbox', { name: 'Notes' })
    expect(field).toHaveAttribute('aria-describedby', expect.stringContaining('-instructions'))
  })

  it('renders select options and exposes errors', () => {
    render(<SelectField label="Format" error="Choose a format." options={[{ value: 'social', label: 'Social' }]} />)

    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('option', { name: 'Social' })).toHaveValue('social')
  })

  it('uses a native checkbox and connects its support copy', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CheckboxField label="Include logo" instructions="Applies to all exports." onChange={onChange} />)

    await user.click(screen.getByRole('checkbox', { name: 'Include logo' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox', { name: 'Include logo' })).toHaveAttribute('aria-describedby', expect.stringContaining('-instructions'))
  })

  it('groups radio options under a labelled fieldset', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RadioGroup label="Tone" options={[{ value: 'warm', label: 'Warm' }, { value: 'direct', label: 'Direct' }]} value="warm" onChange={onChange} />)

    expect(screen.getByRole('radiogroup', { name: 'Tone' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Direct' }))
    expect(onChange).toHaveBeenCalledWith('direct')
  })

  it('uses a native checkbox switch with a visible label', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<SwitchField label="Publish immediately" checked={false} onCheckedChange={onCheckedChange} />)

    const control = screen.getByRole('switch', { name: 'Publish immediately' })
    expect(control).not.toBeChecked()
    await user.click(control)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})
