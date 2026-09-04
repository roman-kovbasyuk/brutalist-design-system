import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { MvpApp } from './MvpApp.jsx'

function createCampaign(name = 'Autumn launch') {
  return {
    id: 'campaign-autumn',
    name,
    status: 'draft',
    brief: { product: '', audience: '', goal: '', offer: '', notes: '' },
    copySets: [],
    selectedCopyId: null,
    directions: [],
    selectedDirectionId: null,
    composition: null,
    versions: [],
    reviewEvents: [],
    delivery: null,
    providerMode: 'mock',
    updatedAt: '2026-09-04T12:00:00.000Z',
  }
}

describe('MVP app', () => {
  test('loads the campaign list and exposes the current workflow state', async () => {
    const gateway = {
      listCampaigns: vi.fn().mockResolvedValue([createCampaign()]),
      createCampaign: vi.fn(),
    }

    render(<MvpApp gateway={gateway} />)

    expect(screen.getByText('Loading campaigns…')).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Autumn launch' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Draft campaign' })).toBeVisible()
  })

  test('creates a campaign through the gateway and selects it', async () => {
    const user = userEvent.setup()
    const created = createCampaign('Winter campaign')
    const gateway = {
      listCampaigns: vi.fn().mockResolvedValue([]),
      createCampaign: vi.fn().mockResolvedValue(created),
    }

    render(<MvpApp gateway={gateway} />)
    await screen.findByRole('heading', { name: 'No campaigns yet' })
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))
    await user.type(screen.getByLabelText('Campaign name'), 'Winter campaign')
    await user.click(screen.getByRole('button', { name: 'Create and open' }))

    expect(gateway.createCampaign).toHaveBeenCalledWith(
      { name: 'Winter campaign' },
      expect.objectContaining({
        actor: expect.objectContaining({ role: 'marketer' }),
        idempotencyKey: expect.stringMatching(/^create-campaign-/),
      }),
    )
    expect(await screen.findByRole('button', { name: 'Winter campaign' })).toHaveAttribute('aria-current', 'page')
  })

  test('routes brief and copy decisions through the campaign gateway', async () => {
    const user = userEvent.setup()
    const readyBrief = createCampaign()
    readyBrief.brief = {
      product: 'Norwegian course',
      audience: 'New arrivals',
      goal: 'Start a trial',
      offer: '15% off',
      notes: '',
    }
    const withCopy = {
      ...readyBrief,
      copySets: [{
        id: 'copy-set-1',
        createdAt: '2026-09-04T12:00:00.000Z',
        candidates: [
          { id: 'copy-1', headline: 'Speak sooner', body: 'Norwegian for real life.', offer: '15% off', cta: 'Start learning' },
          { id: 'copy-2', headline: 'Feel at home', body: 'Useful language habits.', offer: '15% off', cta: 'Try it free' },
          { id: 'copy-3', headline: 'Norwegian, daily', body: 'Short useful lessons.', offer: '15% off', cta: 'See the course' },
        ],
      }],
    }
    const gateway = {
      listCampaigns: vi.fn().mockResolvedValue([readyBrief]),
      createCampaign: vi.fn(),
      performAction: vi.fn().mockResolvedValue(withCopy),
    }

    render(<MvpApp gateway={gateway} />)
    await screen.findByRole('heading', { name: 'Copy options' })
    await user.click(screen.getByRole('button', { name: 'Generate 3 copy options' }))

    expect(gateway.performAction).toHaveBeenCalledWith(
      readyBrief.id,
      'generate_copy',
      { copySet: expect.objectContaining({ candidates: expect.any(Array) }) },
      expect.objectContaining({
        actor: expect.objectContaining({ role: 'marketer' }),
        idempotencyKey: expect.stringMatching(/^generate-copy-/),
      }),
    )
    expect(gateway.performAction.mock.calls[0][2].copySet.candidates).toHaveLength(3)
    expect(await screen.findByText('Speak sooner')).toBeVisible()
  })
})
