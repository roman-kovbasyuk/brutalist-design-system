import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { CopyStage } from './CopyStage.jsx'

const candidates = Array.from({ length: 5 }, (_, index) => ({ id: `copy-${index}`, headline: `Listen your way ${index + 1}`, body: 'Less noise. More of your music.', cta: 'Shop now', offer: index === 0 ? '20% off until Sunday' : '', visualPrompt: 'Headphones on a desk' }))
const workspace = { campaign: { selectedCopyId: 'set-1' }, copies: [{ id: 'set-1', candidates, selectedCandidateId: 'copy-0', stale: false }], directions: [] }
describe('copy comparison', () => {
  test('defaults to a table of five options with four copy elements', () => {
    render(<CopyStage workspace={workspace} onSelect={vi.fn()} />)
    const table = screen.getByRole('table', { name: 'Banner copy options' })
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    for (const name of ['Headline', 'Short text', 'CTA', 'Tag']) expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument()
    expect(within(table).getByText('20% off until Sunday')).toBeInTheDocument()
  })
  test('preserves selected option when switching table, cards and banner previews', () => {
    const onSelect = vi.fn()
    render(<CopyStage workspace={workspace} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cards', exact: true }))
    expect(screen.getByRole('button', { name: 'Select option 1' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Select option 2' }))
    expect(onSelect).toHaveBeenCalledWith('copy-1')
    fireEvent.click(screen.getByRole('button', { name: 'Banners', exact: true }))
    expect(screen.getAllByRole('img')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Select option 1' })).toBeDisabled()
    expect(screen.getByText(/Layout previews/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Table', exact: true }))
    expect(screen.getByRole('button', { name: 'Select option 1' })).toBeDisabled()
  })
  test('prevents changing copy when the campaign is locked', () => {
    render(<CopyStage workspace={workspace} onSelect={vi.fn()} readOnly />)
    for (let index = 1; index <= 5; index++) expect(screen.getByRole('button', { name: `Select option ${index}` })).toBeDisabled()
  })
})
