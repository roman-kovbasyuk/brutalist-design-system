import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Combobox } from './Combobox'
import { MultiSelect } from './MultiSelect'

const options = [
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'In review' },
  { value: 'published', label: 'Published', disabled: true },
] as const

describe('portable selection controls', () => {
  it('filters a typed combobox and returns the option value', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Combobox label="Status" options={options} value={null} onValueChange={onValueChange} />)

    const input = screen.getByRole('combobox', { name: 'Status' })
    await user.type(input, 'review')
    expect(screen.getByRole('option', { name: 'In review' })).toBeVisible()
    expect(screen.queryByRole('option', { name: 'Draft' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'In review' }))
    expect(onValueChange).toHaveBeenCalledWith('review')
  })

  it('keeps disabled combobox options unavailable and supports clear', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Combobox label="Status" options={options} value="draft" onValueChange={onValueChange} clearable />)

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    expect(screen.getByRole('option', { name: 'Published' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('option', { name: 'Published' }))
    expect(onValueChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Clear Status' }))
    expect(onValueChange).toHaveBeenCalledWith(null)
  })

  it('toggles values in a multiselect without losing the generic value type', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<MultiSelect label="Stages" options={options} value={['draft']} onValueChange={onValueChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Stages' }))
    await user.click(screen.getByRole('option', { name: 'In review' }))
    expect(onValueChange).toHaveBeenCalledWith(['draft', 'review'])
  })

  it('removes an already selected multiselect value from its option', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<MultiSelect label="Stages" options={options} value={['draft', 'review']} onValueChange={onValueChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Stages' }))
    await user.click(screen.getByRole('option', { name: 'Draft', selected: true }))
    expect(onValueChange).toHaveBeenCalledWith(['review'])
  })
})
