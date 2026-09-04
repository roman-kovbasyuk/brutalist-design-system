import { beforeEach, describe, expect, test } from 'vitest'
import { createMockCopySet } from './fixtures.js'
import { createMockCampaignGateway } from './mockCampaignGateway.js'

const marketerMeta = { actor: { id: 'maya', role: 'marketer' }, idempotencyKey: 'request-1' }

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }
}

describe('mock campaign gateway', () => {
  let storage
  let idSequence

  beforeEach(() => {
    storage = createMemoryStorage()
    idSequence = 0
  })

  function createGateway() {
    return createMockCampaignGateway({
      storage,
      now: () => '2026-09-04T12:00:00.000Z',
      id: () => `generated-${++idSequence}`,
      latency: 0,
    })
  }

  test('persists a created campaign across gateway instances', async () => {
    const first = createGateway()
    const created = await first.createCampaign({ name: 'Autumn launch' }, marketerMeta)
    const second = createGateway()

    expect(await second.getCampaign(created.id)).toEqual(created)
    expect(await second.listCampaigns()).toEqual([created])
  })

  test('mock copy generation uses the free-form brief', () => {
    let nextId = 0
    const copySet = createMockCopySet({
      campaign: {
        brief: {
          text: 'Launch a practical Norwegian course in Oslo for new arrivals.',
          product: '',
          audience: '',
          goal: '',
          offer: '',
        },
      },
      now: () => '2026-09-04T12:00:00.000Z',
      id: () => `copy-${++nextId}`,
    })

    expect(copySet.candidates).toHaveLength(3)
    expect(copySet.candidates[0].body).toContain('Oslo')
  })

  test('returns the first result for a repeated idempotency key', async () => {
    const gateway = createGateway()
    const created = await gateway.createCampaign({ name: 'Autumn launch' }, marketerMeta)
    const copySet = {
      id: 'copy-set-1',
      candidates: [{ id: 'copy-1', headline: 'Speak sooner', body: 'Practical Norwegian', offer: '15% off', cta: 'Start learning' }],
      createdAt: '2026-09-04T12:00:00.000Z',
    }
    const meta = { ...marketerMeta, idempotencyKey: 'generate-copy-1' }

    const first = await gateway.performAction(created.id, 'generate_copy', { copySet }, meta)
    const repeated = await gateway.performAction(created.id, 'generate_copy', {
      copySet: { ...copySet, id: 'copy-set-should-not-be-used' },
    }, meta)

    expect(repeated).toEqual(first)
    expect(repeated.copySets).toHaveLength(1)
  })

  test('persists workflow actions and exposes their available actions', async () => {
    const gateway = createGateway()
    const created = await gateway.createCampaign({ name: 'Autumn launch' }, marketerMeta)
    const copySet = {
      id: 'copy-set-1',
      candidates: [{ id: 'copy-1', headline: 'Speak sooner', body: 'Practical Norwegian', offer: '15% off', cta: 'Start learning' }],
      createdAt: '2026-09-04T12:00:00.000Z',
    }

    await gateway.performAction(created.id, 'generate_copy', { copySet }, {
      ...marketerMeta,
      idempotencyKey: 'generate-copy-1',
    })
    const selected = await gateway.performAction(created.id, 'select_copy', { copyId: 'copy-1' }, {
      ...marketerMeta,
      idempotencyKey: 'select-copy-1',
    })

    expect(selected.status).toBe('copy_ready')
    expect(await gateway.getAvailableActions(created.id, marketerMeta.actor)).toContain('generate_directions')
  })

  test('recovers safely from invalid persisted data', async () => {
    storage.setItem('banner-studio:mvp:v1', '{not-json')

    expect(await createGateway().listCampaigns()).toEqual([])
  })

  test('refuses a missing idempotency key for mutations', async () => {
    await expect(createGateway().createCampaign({ name: 'Autumn launch' }, {
      actor: marketerMeta.actor,
      idempotencyKey: '',
    })).rejects.toThrow('idempotency_key_required')
  })
})
