import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { CopyStage } from './CopyStage.jsx'

const candidates = Array.from({ length: 5 }, (_, index) => ({ id: `copy-${index}`, headline: `Listen your way ${index + 1}`, body: 'Less noise. More of your music.', cta: 'Shop now', offer: index === 0 ? '20% off until Sunday' : '', visualPrompt: 'Headphones on a desk' }))
const workspace = { campaign: { selectedCopyId: 'set-1' }, copies: [{ id: 'set-1', candidates, selectedCandidateId: 'copy-0', approvedCandidateIds: ['copy-0'], stale: false }], directions: [] }
describe('Copy stage compatibility adapter', () => {
  test('renders five cards with headline, body, CTA and optional tag', () => {
    render(<CopyStage workspace={workspace} />)
    expect(screen.getAllByRole('article')).toHaveLength(5)
    const card = screen.getAllByRole('article')[0]
    expect(within(card).getByRole('heading')).toHaveTextContent('Listen your way 1')
    expect(within(card).getByText('Less noise. More of your music.')).toBeVisible()
    expect(within(card).getByText('Shop now')).toBeVisible()
    expect(within(card).getByText('20% off until Sunday')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
  test('forwards approval, removal and append actions', async () => {
    const onApprove = vi.fn(), onDelete = vi.fn(), onGenerate = vi.fn()
    render(<CopyStage workspace={workspace} onApprove={onApprove} onDelete={onDelete} onGenerate={onGenerate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve option 2' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete option 2' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Delete option 2' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate More Options' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Generate More Options' }))
    expect(onApprove).toHaveBeenCalledWith('copy-1')
    expect(onDelete).toHaveBeenCalledWith('copy-1')
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })
  test('locked campaigns retain previews but disable changes', () => {
    render(<CopyStage workspace={workspace} onApprove={vi.fn()} onDelete={vi.fn()} readOnly />)
    for (let index = 1; index <= 5; index++) {
      expect(screen.getByRole('button', { name: `Approve option ${index}` })).toBeDisabled()
      expect(screen.getByRole('button', { name: `Delete option ${index}` })).toBeDisabled()
      expect(screen.getByRole('button', { name: `Preview option ${index}` })).toBeEnabled()
    }
  })
})
