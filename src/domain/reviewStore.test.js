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
      selectedBanners: [{
        id: 'banner-1',
        templateId: 'split-left',
        templateName: 'Split frame',
        format: 'Vertical',
        dimensions: '1080×1350',
        platform: 'SMM Static',
        mediaType: 'video',
        sourceAssetId: 'video-1',
        sourceStaticId: 'static-1',
        template: { id: 'split-left', name: 'Split frame', layout: 'split-left', alignment: 'left', family: 'split', masterRatio: 'portrait', index: 1 },
        visual: { id: 'visual-1', name: 'Nordic portrait', direction: 'Natural light', motif: 'portrait', palette: ['#111111', '#222222', '#333333'] },
        content: { headline: 'Speak before you move', body: 'Practical Norwegian.', offer: '15% off', cta: 'Start learning' },
        motionPreset: { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 },
      }],
      selectedBannerIds: ['banner-1'],
      generatedAssets: [{
        id: 'video-1', sourcePromptId: 'prompt-1', sourceStaticId: 'static-1', mediaType: 'video', name: 'Nordic portrait', title: 'Portrait', direction: 'Natural light', prompt: 'Portrait prompt', motif: 'portrait', palette: ['#111111', '#222222', '#333333'], cost: 1.8, generation: { mode: 'simulated', provider: 'local' },
      }],
      motionByBannerId: { 'banner-1': { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 } },
      submittedAt: '2026-09-02T09:00:00.000Z',
      reviewedAt: null,
      approvedAt: null,
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

  test('normalizes malformed persisted fields before workflow consumers receive them', () => {
    const storage = createStorage()
    storage.setItem(`${STORAGE_PREFIX}campaign-a`, JSON.stringify({
      status: 'not-a-review-status',
      selectedBanners: [null, { id: 42 }, { id: 'banner-1', content: null, template: null }],
      selectedBannerIds: ['banner-1', 42],
      generatedAssets: [{ id: null }, { id: 'asset-1', mediaType: 'static' }],
      motionByBannerId: { 'banner-1': ['not-an-object'], 'banner-2': { text: 'fade-up' } },
      designerName: 42,
    }))

    expect(readReview('campaign-a', storage)).toMatchObject({
      status: 'draft',
      selectedBanners: [{ id: 'banner-1' }],
      selectedBannerIds: ['banner-1'],
      generatedAssets: [{ id: 'asset-1', mediaType: 'static' }],
      motionByBannerId: { 'banner-2': { text: 'fade-up' } },
      designerName: null,
    })
  })

  test('sanitizes every persisted field that reaches a review banner or generated asset', () => {
    const storage = createStorage()
    storage.setItem(`${STORAGE_PREFIX}campaign-a`, JSON.stringify({
      status: 'approved',
      selectedBanners: [{
        id: 'banner-1',
        templateId: { unsafe: true },
        templateName: { unsafe: true },
        dimensions: { unsafe: true },
        platform: ['unsafe'],
        mediaType: { unsafe: true },
        template: { name: {}, layout: {}, alignment: {}, family: {}, masterRatio: {}, index: {} },
        visual: { id: {}, motif: {}, palette: [{ unsafe: true }] },
        content: { headline: { unsafe: true }, body: [], offer: null, cta: 12 },
        motionPreset: { text: {}, image: [], cta: null, replayVersion: {} },
      }],
      selectedBannerIds: ['banner-1', {}, ''],
      generatedAssets: [{ id: 'asset-1', mediaType: {}, name: {}, prompt: [], cost: {}, generation: { mode: {}, provider: {} } }],
    }))

    expect(readReview('campaign-a', storage)).toMatchObject({
      selectedBanners: [{
        id: 'banner-1',
        templateId: '',
        templateName: 'Untitled banner',
        dimensions: 'Not specified',
        platform: 'Not specified',
        mediaType: 'static',
        template: { name: 'Untitled banner', layout: 'split-left', alignment: 'left', family: '', masterRatio: '', index: 1 },
        visual: { id: '', motif: 'portrait', palette: ['#e8d8c6', '#6d81a7', '#1d2940'] },
        content: { headline: '', body: '', offer: '', cta: '' },
        motionPreset: { text: 'none', image: 'none', cta: 'none', replayVersion: 0 },
      }],
      selectedBannerIds: ['banner-1'],
      generatedAssets: [{
        id: 'asset-1', mediaType: 'static', name: '', prompt: '', cost: 0, generation: { mode: 'simulated', provider: 'local' },
      }],
    })
  })

  test('does not acquire browser storage when null is explicitly supplied', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Browser storage should not be read')
      },
    })

    try {
      expect(readReview('campaign-a', null)).toBeNull()
      expect(writeReview('campaign-a', { status: 'in-review' }, null)).toBeNull()
      expect(() => subscribeToReview('campaign-a', () => {}, null)).not.toThrow()
      expect(() => subscribeToReview('campaign-a', () => {}, { storage: null })).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', originalDescriptor)
    }
  })

  test('safely returns null and keeps subscriptions available when browser storage cannot be acquired', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage is unavailable')
      },
    })

    try {
      expect(readReview('campaign-a')).toBeNull()
      expect(writeReview('campaign-a', { status: 'in-review' })).toBeNull()
      expect(() => subscribeToReview('campaign-a', () => {})).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', originalDescriptor)
    }
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
    expect(received).toEqual([expect.objectContaining({ status: 'ready-for-approval' })])

    unsubscribe()
    writeReview('campaign-a', { status: 'approved' }, storage)
    expect(received).toEqual([expect.objectContaining({ status: 'ready-for-approval' })])
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

    expect(received).toEqual([expect.objectContaining({ status: 'ready-for-approval', designerName: 'Jordan Lee' })])
  })
})
