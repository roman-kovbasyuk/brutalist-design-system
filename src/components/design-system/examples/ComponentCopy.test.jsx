import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { ControlSpecimens } from './ControlSpecimens.jsx'

it('names and copies the specific button variant, including changing loading state', async () => {
  const user = userEvent.setup()
  render(<ControlSpecimens />)
  const danger = screen.getByRole('button', { name: 'Delete draft' }).closest('.v2-button-cell')
  await user.hover(danger)
  expect(document.querySelector('.v2-token-copy-target__feedback--visible').textContent).toBe('AppButton variant="danger"')
  await user.click(danger)
  expect(await navigator.clipboard.readText()).toBe('AppButton variant="danger"')
  await user.click(screen.getByRole('button', { name: 'Copy AppButton variant="secondary" disabled' }))
  expect(await navigator.clipboard.readText()).toBe('AppButton variant="secondary" disabled')
  await user.click(screen.getByRole('button', { name: 'Copy AppButton variant="primary" busy' }))
  expect(await navigator.clipboard.readText()).toBe('AppButton variant="primary" busy')
  await user.click(screen.getByRole('button', { name: 'Show idle state' }))
  expect(screen.queryByRole('button', { name: 'Copy AppButton variant="primary" busy' })).toBeNull()
})

it('distinguishes dropdown patterns and preserves typing and selection', async () => {
  const user = userEvent.setup()
  render(<ControlSpecimens />)
  const dropdowns = document.getElementById('components-dropdowns')
  const refs = ['SelectMenu', 'DropdownFields — Autocomplete (.v2-combobox)', 'DropdownFields — Multi-select (.v2-menu-select)']
  const cells = dropdowns.querySelectorAll('.ds-specimen-grid__cell')
  for (const [index, cell] of [...cells].entries()) {
    await user.hover(cell)
    expect(document.querySelector('.v2-token-copy-target__feedback--visible').textContent).toBe(refs[index])
    await user.click(cell)
    expect(await navigator.clipboard.readText()).toBe(refs[index])
    await user.click(within(cell).getByRole('button', { name: `Copy ${refs[index]}` }))
    expect(await navigator.clipboard.readText()).toBe(refs[index])
  }
  await user.type(screen.getByRole('combobox'), 'Osl')
  await user.click(screen.getByRole('option', { name: 'Oslo' }))
  expect(screen.getByRole('combobox').value).toBe('Oslo')
  expect(await navigator.clipboard.readText()).toBe(refs[2])
})
