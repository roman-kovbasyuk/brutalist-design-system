import { render, screen } from '@testing-library/react'
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
