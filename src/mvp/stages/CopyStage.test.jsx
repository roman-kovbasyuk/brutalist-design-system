import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { createDraftCampaignFixture } from '../fixtures.js'
import { CopyStage } from './CopyStage.jsx'

const copySet = {
  id: 'copy-set-1',
  createdAt: '2026-09-04T12:00:00.000Z',
  candidates: [
    { id: 'copy-1', headline: 'Speak sooner', body: 'Norwegian for real life.', offer: '15% off', cta: 'Start learning' },
    { id: 'copy-2', headline: 'Feel at home', body: 'Build useful language habits.', offer: 'First week free', cta: 'Try it free' },
    { id: 'copy-3', headline: 'Norwegian, daily', body: 'Short lessons that fit your day.', offer: 'Join today', cta: 'See the course' },
  ],
}

function campaign(overrides = {}) {
  return {
    ...createDraftCampaignFixture({
      id: 'campaign-1',
      name: 'Autumn launch',
      now: '2026-09-04T12:00:00.000Z',
    }),
    brief: {
      product: 'Norwegian course',
      audience: 'New arrivals',
      goal: 'Start a trial',
      offer: '15% off',
      notes: '',
    },
    ...overrides,
  }
}

describe('CopyStage', () => {
  test('offers a capped mock generation before candidates exist', async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()

    render(<CopyStage campaign={campaign()} pendingAction="" onGenerate={onGenerate} onSelect={vi.fn()} onEdit={vi.fn()} />)

    expect(screen.getByText('3 options per generation')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Generate 3 copy options' }))
    expect(onGenerate).toHaveBeenCalledOnce()
  })

  test('shows three candidates and emits the selected copy ID', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<CopyStage campaign={campaign({ copySets: [copySet] })} pendingAction="" onGenerate={vi.fn()} onSelect={onSelect} onEdit={vi.fn()} />)

    expect(screen.getAllByRole('article')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Use “Feel at home”' }))
    expect(onSelect).toHaveBeenCalledWith('copy-2')
  })

  test('lets the marketer edit and save the selected copy', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()

    render(
      <CopyStage
        campaign={campaign({ status: 'copy_ready', copySets: [copySet], selectedCopyId: 'copy-1' })}
        pendingAction=""
        onGenerate={vi.fn()}
        onSelect={vi.fn()}
        onEdit={onEdit}
      />,
    )

    const headline = screen.getByLabelText('Selected headline')
    await user.clear(headline)
    await user.type(headline, 'Speak before you move')
    await user.click(screen.getByRole('button', { name: 'Save copy changes' }))

    expect(onEdit).toHaveBeenCalledWith('copy-1', expect.objectContaining({
      headline: 'Speak before you move',
      body: 'Norwegian for real life.',
    }))
  })
})
