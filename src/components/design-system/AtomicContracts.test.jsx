import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { PromptComposer } from './PromptComposer.jsx'
import { TemplateLibrary } from '../../studio/TemplateLibrary.jsx'
import { DesignSystemScreen } from '../../screens/DesignSystemScreen.jsx'

test('the status selector opens at its selection, moves with arrows, and restores focus', async () => {
  const user = userEvent.setup()
  render(<DesignSystemScreen />)
  const trigger = screen.getByRole('button', { name: 'Open campaign status options' })
  await user.click(trigger)
  expect(screen.getByRole('option', { name: 'Draft' })).toHaveFocus()
  await user.keyboard('{ArrowDown}{Enter}')
  expect(trigger).toHaveTextContent('In review')
  expect(trigger).toHaveFocus()
  expect(screen.queryByRole('listbox', { name: 'Campaign status options' })).not.toBeInTheDocument()
  await user.keyboard('{ArrowDown}{End}')
  expect(screen.getByRole('option', { name: 'Published' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
})

test('read-only campaign briefs remain selectable and focusable without submitting', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<PromptComposer value="Approved campaign brief" readOnly canSubmit onSubmit={onSubmit} onChange={vi.fn()} />)
  const field = screen.getByRole('textbox', { name: 'Campaign description' })
  expect(field).toBeEnabled()
  expect(field).toHaveAttribute('readonly')
  await user.click(field)
  await user.keyboard('Cannot overwrite')
  expect(field).toHaveValue('Approved campaign brief')
  await user.keyboard('{Control>}{Enter}{/Control}')
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Send prompt' })).not.toBeInTheDocument()
})

test('every template category controls a labelled panel and keyboard focus follows the selection', async () => {
  const user = userEvent.setup()
  render(<TemplateLibrary templates={[]} onChoose={vi.fn()} />)
  const tabs = screen.getAllByRole('tab')
  for (const tab of tabs) {
    const panel = document.getElementById(tab.getAttribute('aria-controls'))
    expect(panel).not.toBeNull()
    expect(panel).toHaveAttribute('role', 'tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', tab.id)
  }
  await user.click(tabs[0])
  await user.keyboard('{ArrowRight}')
  expect(tabs[1]).toHaveFocus()
  expect(screen.getByRole('tabpanel', { name: 'Presentations' })).toBeVisible()
  expect(document.getElementById(tabs[0].getAttribute('aria-controls'))).not.toBeVisible()
  await user.tab()
  expect(screen.getByRole('tabpanel', { name: 'Presentations' })).toHaveFocus()
})
