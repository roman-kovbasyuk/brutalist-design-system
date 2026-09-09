import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AIResult } from './AIResult'
import { AITaskStatus } from './AITaskStatus'

describe('portable AI feedback components', () => {
  it('communicates a running task through an accessible live status', () => {
    render(<AITaskStatus status="running" label="Generating banner concepts" progress={60} />)

    expect(screen.getByRole('status')).toHaveTextContent('Generating banner concepts')
    expect(screen.getByRole('progressbar', { name: 'Generating banner concepts' })).toHaveAttribute('aria-valuenow', '60')
  })

  it('uses an alert role for a failed task', () => {
    render(<AITaskStatus status="failed" label="Could not generate concepts" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not generate concepts')
  })

  it('shows a generic result with a controlled follow-up action', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<AIResult title="Three concepts ready" actionLabel="Use concept" onAction={onAction}>Pick one to continue.</AIResult>)

    await user.click(screen.getByRole('button', { name: 'Use concept' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
