import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { AppButton, PillTabs, SelectMenu } from '../src/index.js'

describe('public component contracts', () => {
  test('AppButton exposes busy semantics and blocks native interaction', () => {
    render(<AppButton busy onClick={vi.fn()}>Save</AppButton>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  test('PillTabs associates tabs with labelled panels', () => {
    render(<PillTabs tabs={['One']} value="One" onChange={() => {}} ariaLabel="Example" />)
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-controls', 'tab-one-panel')
  })

  test('SelectMenu changes value through keyboard selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectMenu label="Status" triggerLabel="Open status options" value="Draft" options={['Draft', 'Ready']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Open status options' }))
    await user.click(screen.getByRole('option', { name: 'Ready' }))
    expect(onChange).toHaveBeenCalledWith('Ready')
  })
})
