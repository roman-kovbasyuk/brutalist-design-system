import { afterEach, describe, expect, test } from 'vitest'
import { readReview, subscribeToReview, writeReview } from './reviewStore.js'

const STORAGE_PREFIX = 'lingu-studio:review:'

function createStorage() {
  const records = new Map()
  return {
    getItem(key) {
      return records.get(key) ?? null
    },
    setItem(key, value) {
      records.set(key, value)
    },
    removeItem(key) {
      records.delete(key)
    },
  }
}

describe('reviewStore', () => {
  const cleanups = []

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
  })

  test('round-trips a submitted package with lifecycle metadata', () => {
    const storage = createStorage()
    const record = {
      status: 'in-review',
      figmaUrl: 'https://www.figma.com/file/demo-lingu-studio',
      selectedBanners: [{ id: 'banner-1', dimensions: '1080×1350', mediaType: 'video' }],
      motionByBannerId: { 'banner-1': { text: 'fade-up' } },
      submittedAt: '2026-09-02T09:00:00.000Z',
      designerName: null,
      marketerName: null,
    }

    writeReview('campaign-a', record, storage)

    expect(readReview('campaign-a', storage)).toEqual(record)
  })

  test('returns null for absent or invalid persisted JSON', () => {
    const storage = createStorage()
    storage.setItem(`${STORAGE_PREFIX}campaign-a`, '{not valid JSON')

    expect(readReview('missing', storage)).toBeNull()
    expect(readReview('campaign-a', storage)).toBeNull()
  })

  test('notifies same-document subscribers only for the matching campaign and stops after unsubscribe', () => {
    const storage = createStorage()
    const campaignAListener = (record) => received.push(record)
    const received = []
    const unsubscribe = subscribeToReview('campaign-a', campaignAListener, { storage })
    cleanups.push(unsubscribe)

    writeReview('campaign-b', { status: 'in-review' }, storage)
    expect(received).toEqual([])

    writeReview('campaign-a', { status: 'ready-for-approval' }, storage)
    expect(received).toEqual([{ status: 'ready-for-approval' }])

    unsubscribe()
    writeReview('campaign-a', { status: 'approved' }, storage)
    expect(received).toEqual([{ status: 'ready-for-approval' }])
  })

  test('notifies a subscriber when a matching cross-tab storage event arrives', () => {
    const storage = createStorage()
    const received = []
    const unsubscribe = subscribeToReview('campaign-a', (record) => received.push(record), { storage })
    cleanups.push(unsubscribe)

    window.dispatchEvent(new StorageEvent('storage', {
      key: `${STORAGE_PREFIX}campaign-a`,
      newValue: JSON.stringify({ status: 'ready-for-approval', designerName: 'Jordan Lee' }),
    }))

    expect(received).toEqual([{ status: 'ready-for-approval', designerName: 'Jordan Lee' }])
  })
})
