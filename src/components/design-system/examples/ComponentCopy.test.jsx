import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { ControlSpecimens } from './ControlSpecimens.jsx'

const componentCopy = reference => `Use this component ${reference} from the app design system (brutalist design system)`

it('removes stale copy icon controls while preserving component-cell copying', async () => {
  const user = userEvent.setup()
  render(<ControlSpecimens />)

  const buttons = screen.getByRole('heading', { name: 'Buttons' }).closest('.v2-specimen-card')
  const danger = screen.getByRole('button', { name: 'Delete draft' }).closest('.v2-button-cell')
  expect(buttons.querySelectorAll('.ds-component-copy')).toHaveLength(0)
  await user.click(danger)
  expect(await navigator.clipboard.readText()).toBe(componentCopy('AppButton variant="danger"'))

  const dropdowns = document.getElementById('components-dropdowns')
  const cell = dropdowns.querySelector('.ds-specimen-grid__cell')
  expect(dropdowns.querySelectorAll('.ds-component-copy')).toHaveLength(0)
  await user.click(cell)
  expect(await navigator.clipboard.readText()).toBe(componentCopy('SelectMenu'))
})

it('names and copies the specific button variant, including changing loading state', async () => {
  const user = userEvent.setup()
  render(<ControlSpecimens />)
  const danger = screen.getByRole('button', { name: 'Delete draft' }).closest('.v2-button-cell')
  await user.hover(danger)
  expect(document.querySelector('.v2-token-copy-target__feedback--visible').textContent).toBe('AppButton variant="danger"')
  await user.click(danger)
  expect(await navigator.clipboard.readText()).toBe(componentCopy('AppButton variant="danger"'))
  await user.click(screen.getByRole('button', { name: 'Unavailable' }).closest('.v2-button-cell'))
  expect(await navigator.clipboard.readText()).toBe(componentCopy('AppButton variant="secondary" disabled'))
  await user.click(screen.getByRole('button', { name: 'Generating…' }).closest('.v2-button-cell'))
  expect(await navigator.clipboard.readText()).toBe(componentCopy('AppButton variant="primary" busy'))
  await user.click(screen.getByRole('button', { name: 'Show idle state' }))
  expect(screen.getByRole('button', { name: 'Generate preview' })).toBeEnabled()
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
    expect(await navigator.clipboard.readText()).toBe(componentCopy(refs[index]))
  }
  await user.type(screen.getByRole('combobox'), 'Osl')
  await user.click(screen.getByRole('option', { name: 'Oslo' }))
  expect(screen.getByRole('combobox').value).toBe('Oslo')
  expect(await navigator.clipboard.readText()).toBe(componentCopy(refs[2]))
})
