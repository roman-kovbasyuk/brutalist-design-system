import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SettingsForm } from './SettingsForm'

test('keeps a rejected settings draft available for retry', async () => {
  const user = userEvent.setup()
  const save = vi.fn().mockResolvedValueOnce({ ok: false, message: 'Try again.' }).mockResolvedValueOnce({ ok: true })
  render(<SettingsForm initialValue={{ name: 'Studio', language: 'English', notifications: true }} onSave={save} />)
  const name = screen.getByRole('textbox', { name: 'Workspace name' })
  await user.clear(name); await user.type(name, 'Library')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again.')
  expect(name).toHaveValue('Library')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(save).toHaveBeenCalledTimes(2)
})

const initialValue = {
  name: 'Studio', language: 'English', notifications: true,
  preferences: { theme: 'Light', density: 'Comfortable', summary: true, mentions: true, replies: false, sounds: false },
}

test('groups settings accessibly and restores the saved appearance after cancel', async () => {
  const user = userEvent.setup()
  const save = vi.fn().mockResolvedValue({ ok: true })
  render(<SettingsForm initialValue={initialValue} onSave={save} />)
  expect(within(screen.getByRole('region', { name: 'Workspace' })).getByLabelText('Workspace name')).toHaveValue('Studio')
  expect(within(screen.getByRole('region', { name: 'Notifications' })).getByRole('switch', { name: 'Mentions' })).toBeChecked()
  const appearance = screen.getByRole('region', { name: 'Appearance' })
  await user.click(within(appearance).getByRole('button', { name: 'Appearance: Light' }))
  await user.click(within(appearance).getByRole('option', { name: 'Dark' }))
  await user.click(within(appearance).getByRole('button', { name: 'Density: Comfortable' }))
  await user.click(within(appearance).getByRole('option', { name: 'Compact' }))
  expect(screen.getByRole('group', { name: 'Preferences preview' })).toHaveAttribute('data-theme', 'dark')
  expect(screen.getByRole('group', { name: 'Preferences preview' })).toHaveAttribute('data-density', 'compact')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(save).toHaveBeenCalledWith({ ...initialValue, preferences: { ...initialValue.preferences, theme: 'Dark', density: 'Compact' } })
  await user.click(within(appearance).getByRole('button', { name: 'Appearance: Dark' }))
  await user.click(within(appearance).getByRole('option', { name: 'Light' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(within(appearance).getByRole('button', { name: 'Appearance: Dark' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'Preferences preview' })).toHaveAttribute('data-theme', 'dark')
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
})

test('uses standard panels for each workspace settings group', () => {
  render(<SettingsForm initialValue={initialValue} onSave={vi.fn()} />)

  expect(screen.getByRole('heading', { name: 'Workspace' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Notifications' })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Workspace' })).toBeVisible()
})

test('locks the draft during saving and recovers from a thrown save error', async () => {
  const user = userEvent.setup()
  let rejectSave!: (error: Error) => void
  const save = vi.fn().mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject }))
  render(<SettingsForm initialValue={initialValue} onSave={save} />)
  await user.type(screen.getByLabelText('Workspace name'), ' updated')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  for (const label of ['Workspace name', 'Mentions', 'Play notification sounds']) {
    expect(screen.getByLabelText(label, { exact: true })).toBeDisabled()
  }
  expect(screen.getByRole('checkbox', { name: 'Notifications' })).toBeDisabled()
  for (const name of ['Language: English', 'Appearance: Light', 'Density: Comfortable']) {
    expect(screen.getByRole('button', { name })).toBeDisabled()
  }
  await act(async () => rejectSave(new Error('Offline')))
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save settings. Try again.')
  expect(screen.getByLabelText('Workspace name')).toHaveValue('Studio updated')
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled()
})

test('uses the shared SelectMenu dropdowns for each settings choice', async () => {
  const user = userEvent.setup()
  render(<SettingsForm initialValue={initialValue} onSave={vi.fn()} />)

  expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
  const language = screen.getByRole('button', { name: 'Language: English' })
  await user.click(language)
  const languageOptions = screen.getByRole('listbox', { name: 'Language' })
  expect(within(languageOptions).getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true')
  await user.click(within(languageOptions).getByRole('option', { name: 'Deutsch' }))
  expect(language).toHaveTextContent('Deutsch')
  expect(screen.queryByRole('listbox', { name: 'Language' })).not.toBeInTheDocument()

  const appearance = screen.getByRole('button', { name: 'Appearance: Light' })
  expect(appearance).toHaveAccessibleDescription('Theme preview only; this does not change the application theme.')
  await user.click(appearance)
  await user.click(screen.getByRole('option', { name: 'Dark' }))
  expect(appearance).toHaveTextContent('Dark')
})

test('prevents saving an empty workspace name and keeps optional preferences optional', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(<SettingsForm initialValue={{ name: 'Studio', language: 'English', notifications: true }} onSave={save} />)
  expect(screen.queryByRole('region', { name: 'Appearance' })).not.toBeInTheDocument()
  await user.clear(screen.getByLabelText('Workspace name'))
  expect(screen.getByLabelText('Workspace name')).toHaveAccessibleDescription('Enter a workspace name.')
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  expect(save).not.toHaveBeenCalled()
})
