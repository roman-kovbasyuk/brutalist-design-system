import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Alert } from './Alert'
import { ErrorState } from './ErrorState'
import { Progress } from './Progress'
import { Skeleton } from './Skeleton'
import { StatusBadge } from './StatusBadge'
import { ToastProvider, useToast } from './ToastProvider'

describe('portable feedback components', () => {
  it('communicates a status with a semantic label and tone', () => {
    render(<StatusBadge tone="success">Published</StatusBadge>)
    expect(screen.getByText('Published')).toHaveAttribute('data-tone', 'success')
  })

  it('makes an actionable alert dismissible and announces its urgency', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<Alert tone="danger" title="Upload failed" onDismiss={onDismiss}>Try again.</Alert>)

    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed')
    await user.click(screen.getByRole('button', { name: 'Dismiss alert' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('exposes progress values and visible status text', () => {
    render(<Progress value={42} label="Exporting banners" />)
    expect(screen.getByRole('progressbar', { name: 'Exporting banners' })).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('keeps decorative skeletons out of the accessibility tree', () => {
    const { container } = render(<Skeleton lines={2} />)
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('offers a labelled recovery action from an error state', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorState title="Could not load blocks" description="Check your connection." actionLabel="Retry" onAction={onRetry} />)

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('adds and dismisses toasts through the provider context', async () => {
    const user = userEvent.setup()
    function Trigger() {
      const { toast } = useToast()
      return <button onClick={() => toast({ title: 'Saved', description: 'Your changes are ready.' })}>Save</button>
    }
    render(<ToastProvider><Trigger /></ToastProvider>)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    await user.click(screen.getByRole('button', { name: 'Dismiss Saved' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
