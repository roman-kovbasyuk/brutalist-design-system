import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AIWorkspace } from './AIWorkspace'

test('keeps a controlled prompt available while a running task is cancelled', async () => {
  const cancel = vi.fn(); const user = userEvent.setup()
  render(<AIWorkspace prompt="Summarize notes" onPromptChange={vi.fn()} state="running" message="Preparing" onSubmit={vi.fn()} onCancel={cancel} />)
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue('Summarize notes')
})
