import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { PromptComposer } from './PromptComposer.jsx'
import { SelectMenu } from './molecules/SelectMenu.jsx'

test('the status selector opens at its selection, moves with arrows, and restores focus', async () => {
  const user = userEvent.setup()
  function StatusSelectorFixture() {
    const [value, setValue] = useState('Draft')
    return <SelectMenu label="Campaign status options" triggerLabel="Open campaign status options"
      value={value} options={['Draft', 'In review', 'Ready', 'Published']} onChange={setValue} />
  }
  render(<StatusSelectorFixture />)
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

test('the shared composer can describe a domain-specific mixed-file intake', () => {
  render(<PromptComposer value="" onChange={vi.fn()} onAttach={vi.fn()} files={[]}
    accept=".pdf,.svg,.woff2" formatLabel="PDF, SVG, WOFF2" attachmentsLabel="Brand materials" fileInputLabel="Brand files" attachLabel="Attach brand materials" />)
  expect(screen.getByLabelText('Brand files')).toHaveAttribute('accept', '.pdf,.svg,.woff2')
  expect(screen.getByRole('button', { name: 'Attach brand materials' })).toBeVisible()
  expect(screen.getByText('PDF, SVG, WOFF2')).toBeVisible()
})
