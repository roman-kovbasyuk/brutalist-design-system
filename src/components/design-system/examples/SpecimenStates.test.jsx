import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { SpecimenCard } from './SpecimenCard.jsx'
import { SelectionControlSpecimens } from './SelectionControlSpecimens.jsx'
import { TagSpecimens } from './TagSpecimens.jsx'
import { ControlSpecimens, NavigationSpecimens } from './ControlSpecimens.jsx'
import { MotionSpecimens } from './MotionSpecimens.jsx'
import { CopyModeProvider, useCopyMode } from '../atoms/CopyMode.jsx'

function CopyModeHarness() {
  const { enabled, setEnabled } = useCopyMode()
  return <><button onClick={() => setEnabled(!enabled)}>Change copy mode</button><TagSpecimens /></>
}

it('omits state controls when a group has no configurable states', () => {
  render(<SpecimenCard title="Static example">A sample</SpecimenCard>)
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(screen.queryByRole('group')).not.toBeInTheDocument()
})

it('changes checklist disabled and mixed states and copies the displayed configuration', async () => {
  const user = userEvent.setup()
  render(<SelectionControlSpecimens />)
  const card = document.getElementById('components-checklist')
  const controls = within(card).getByRole('group', { name: 'Checklist states' })
  const checkbox = within(card).getByRole('checkbox', { name: 'Include animated formats' })
  await user.click(within(controls).getByRole('switch', { name: 'Mixed' }))
  expect(checkbox).toBePartiallyChecked()
  await user.click(within(controls).getByRole('switch', { name: 'Disabled' }))
  expect(checkbox).toBeDisabled()
  await user.click(checkbox.closest('[data-component-reference]'))
  expect(await navigator.clipboard.readText()).toContain('disabled={true} indeterminate={true}')
  await user.click(within(controls).getByRole('switch', { name: 'Disabled' }))
  expect(checkbox).toBeEnabled()
  await user.click(checkbox)
  expect(checkbox).not.toBePartiallyChecked()
  expect(within(controls).getByRole('switch', { name: 'Mixed' })).not.toBeChecked()
})

it('keeps Tag rendering, cell copies, and group copies synchronized with toggles', async () => {
  const user = userEvent.setup()
  render(<TagSpecimens />)
  const controls = screen.getByRole('group', { name: 'Tags states' })
  await user.click(within(controls).getByRole('switch', { name: 'Outline' }))
  await user.click(within(controls).getByRole('switch', { name: 'Icons' }))
  const ready = screen.getByText('Ready')
  expect(ready).toHaveClass('ds-tag--outline')
  expect(ready.querySelector('svg')).toBeNull()
  await user.click(ready)
  expect(await navigator.clipboard.readText()).toContain('Tag variant="outline" tone="success" icons={false}')
  await user.click(screen.getByRole('button', { name: 'Copy Tags group' }))
  expect(await navigator.clipboard.readText()).toContain('outline={true} icons={false}')
})

it('keeps configuration switches usable with copy mode off and on', async () => {
  const user = userEvent.setup()
  localStorage.setItem('ds-click-to-copy', 'false')
  render(<CopyModeProvider><CopyModeHarness /></CopyModeProvider>)
  expect(document.getElementById('components-tags')).toHaveAttribute('data-copy-enabled', 'false')
  const outline = screen.getByRole('switch', { name: 'Outline' })
  await user.click(outline)
  expect(screen.getByText('Paid social')).toHaveClass('ds-tag--outline')
  await user.click(screen.getByRole('button', { name: 'Change copy mode' }))
  expect(document.getElementById('components-tags')).toHaveAttribute('data-copy-enabled', 'true')
  await user.click(outline)
  expect(screen.getByText('Paid social')).toHaveClass('ds-tag--filled')
  await user.click(screen.getByText('Paid social'))
  expect(await navigator.clipboard.readText()).toContain('.ds-tag--filled')
  localStorage.removeItem('ds-click-to-copy')
})

it('applies text field and dropdown configuration to their real controls', async () => {
  const user = userEvent.setup()
  render(<ControlSpecimens />)
  expect(screen.getByText('Add a campaign objective')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Validate brief' })).not.toBeInTheDocument()
  await user.click(within(screen.getByRole('group', { name: 'Fields states' })).getByRole('switch', { name: 'Validation fail' }))
  expect(screen.queryByText('Add a campaign objective')).not.toBeInTheDocument()
  await user.click(screen.getByRole('group', { name: 'Fields states' }).querySelector('input'))
  expect(screen.getByRole('textbox', { name: 'Campaign objective' })).toHaveAttribute('readonly')
  expect(screen.getByRole('textbox', { name: 'Creative notes' })).toHaveAttribute('readonly')
  expect(screen.getByRole('searchbox', { name: 'Search campaigns' })).toHaveAttribute('readonly')
  await user.click(within(screen.getByRole('group', { name: 'Fields states' })).getByRole('switch', { name: 'Helper text' }))
  expect(screen.queryByText('State one measurable outcome for this campaign.')).not.toBeInTheDocument()
  await user.click(within(screen.getByRole('group', { name: 'Dropdowns states' })).getByRole('switch', { name: 'Disabled' }))
  expect(screen.getByRole('button', { name: 'Primary channel: Paid social' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Open channel options' })).toBeDisabled()
  expect(screen.getByRole('combobox')).toBeDisabled()
})

it('synchronizes inline confirmation interactions and copied references', async () => {
  const user = userEvent.setup()
  render(<MotionSpecimens />)
  const inline = document.getElementById('components-inline-confirmation')
  expect(within(inline).queryByRole('switch', { name: 'Open' })).not.toBeInTheDocument()
  await user.click(within(inline).getByRole('button', { name: 'Open inline confirmation' }))
  expect(screen.getByRole('button', { name: 'Keep draft' })).toBeVisible()
  await user.click(within(inline).getByRole('button', { name: 'Copy Inline confirmation group' }))
  expect(await navigator.clipboard.readText()).toContain('open={true}')
  await user.click(screen.getByRole('button', { name: 'Keep draft' }))
  expect(within(inline).getByRole('button', { name: 'Open inline confirmation' })).toBeVisible()
})
