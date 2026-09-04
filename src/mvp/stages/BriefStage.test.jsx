import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { createDraftCampaignFixture } from '../fixtures.js'
import { BriefStage } from './BriefStage.jsx'

function campaign(overrides = {}) {
  return {
    ...createDraftCampaignFixture({
      id: 'campaign-1',
      name: 'Autumn launch',
      now: '2026-09-04T12:00:00.000Z',
    }),
    ...overrides,
  }
}

describe('BriefStage', () => {
  test('requires the product, audience, and goal before saving', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(<BriefStage campaign={campaign()} pendingAction="" onSave={onSave} />)

    expect(screen.getByRole('button', { name: 'Save brief' })).toBeDisabled()
    await user.type(screen.getByLabelText('Product'), 'Norwegian course')
    await user.type(screen.getByLabelText('Audience'), 'New arrivals')
    await user.type(screen.getByLabelText('Goal'), 'Start a trial')
    expect(screen.getByRole('button', { name: 'Save brief' })).toBeEnabled()
  })

  test('submits the complete structured brief', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const saved = campaign({
      brief: {
        product: 'Norwegian course',
        audience: 'New arrivals',
        goal: 'Start a trial',
        offer: '15% off',
        notes: 'Friendly, not childish',
      },
    })

    render(<BriefStage campaign={saved} pendingAction="" onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'Save brief' }))

    expect(onSave).toHaveBeenCalledWith(saved.brief)
  })

  test('warns when changing the brief will reset later decisions', () => {
    render(<BriefStage campaign={campaign({ status: 'direction_selected', selectedCopyId: 'copy-1' })} pendingAction="" onSave={vi.fn()} />)

    expect(screen.getByRole('note')).toHaveTextContent('Saving changes resets selected copy, image ideas, and template work')
  })
})
