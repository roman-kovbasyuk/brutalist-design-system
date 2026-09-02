import { describe, expect, test } from 'vitest'
import {
  analyzeBrief,
  canAdvance,
  createBannerCandidates,
  createCreativeFingerprint,
  createStaticAsset,
  createVideoAsset,
  estimateVideoBatch,
  generatePromptIdeas,
  generateVisuals,
  getContentWarnings,
  getResizeLayouts,
  isApprovalCurrent,
  isValidFigmaUrl,
} from './campaign.js'
import { templates } from '../data/templates.js'
import { campaignHistory, dashboardMetrics, productionTotals } from '../data/campaigns.js'

describe('campaign domain', () => {
  test('rejects an empty brief so generation cannot silently invent a campaign', () => {
    expect(() => analyzeBrief('   ')).toThrow('Add a campaign idea')
  })

  test('turns a free-form brief into usable campaign copy and media prompts', () => {
    const strategy = analyzeBrief(
      'Launch a Norwegian language intensive. Offer 15% off until Sunday for people moving to Oslo.',
    )

    expect(strategy).toMatchObject({
      audience: 'People planning to move who want to speak sooner',
      offer: '15% off the intensive',
      headline: 'Speak before you move',
      cta: 'Start learning',
    })
    expect(strategy.imagePrompt).toContain('editorial campaign image')
    expect(strategy.videoPrompt).toContain('vertical motion loop')
  })

  test('generates exactly five client-selectable visual directions', () => {
    const visuals = generateVisuals(analyzeBrief('A language course for moving abroad with 15% off'))

    expect(visuals).toHaveLength(5)
    expect(new Set(visuals.map((visual) => visual.id)).size).toBe(5)
    expect(visuals.every((visual) => visual.prompt.length > 20)).toBe(true)
  })

  test('turns a strategy into five stable prompt ideas with a transparent static cost', () => {
    const strategy = analyzeBrief('A language course for moving abroad with 15% off')
    const prompts = generatePromptIdeas(strategy)

    expect(prompts).toHaveLength(5)
    expect(prompts[0]).toMatchObject({
      id: 'prompt-nordic-portrait',
      title: 'Arrival portrait',
      hero: 'A new Oslo resident',
      subject: 'A new Oslo resident',
      action: 'rehearses a first-day Norwegian greeting',
      shot: 'Eye-level medium portrait · soft morning light',
      estimatedStaticCost: 0.12,
    })
    expect(prompts.map((prompt) => prompt.title)).toEqual([
      'Arrival portrait',
      'Tram rehearsal',
      'Café exchange',
      'Everyday win',
      'Evening recap',
    ])
    expect(prompts.every((prompt) => prompt.hero && prompt.action && prompt.prompt.includes(prompt.hero))).toBe(true)
    expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(5)
  })

  test('creates linked static and video assets with stable IDs and deterministic costs', () => {
    const prompt = {
      id: 'prompt-nordic-portrait',
      title: 'Nordic portrait',
      prompt: 'A person in an urban setting',
    }
    const staticAsset = createStaticAsset(prompt)
    const videoAsset = createVideoAsset(staticAsset)

    expect(staticAsset).toMatchObject({
      id: 'static-prompt-nordic-portrait',
      sourcePromptId: 'prompt-nordic-portrait',
      mediaType: 'static',
      cost: 0.12,
      generation: { mode: 'simulated', provider: 'local' },
    })
    expect(createStaticAsset(prompt)).toEqual(staticAsset)
    expect(videoAsset).toMatchObject({
      id: 'video-static-prompt-nordic-portrait',
      sourceStaticId: 'static-prompt-nordic-portrait',
      mediaType: 'video',
      cost: 1.8,
      generation: { mode: 'simulated', provider: 'local' },
    })
    expect(createVideoAsset(staticAsset)).toEqual(videoAsset)
  })

  test('estimates only unique static assets for video generation', () => {
    const staticAsset = createStaticAsset({
      id: 'prompt-nordic-portrait',
      title: 'Nordic portrait',
      prompt: 'A person in an urban setting',
    })

    expect(estimateVideoBatch([staticAsset, staticAsset])).toEqual({
      count: 1,
      unitCost: 1.8,
      totalCost: 1.8,
    })
  })

  test('rounds multi-image video estimates to currency precision', () => {
    const assets = Array.from({ length: 13 }, (_, index) => ({
      id: `static-prompt-${index + 1}`,
      mediaType: 'static',
    }))

    expect(estimateVideoBatch(assets)).toEqual({
      count: 13,
      unitCost: 1.8,
      totalCost: 23.4,
    })
  })

  test('derives duplicate-safe banner candidates and applies format platform and media filters', () => {
    const staticAsset = createStaticAsset({
      id: 'prompt-nordic-portrait',
      title: 'Nordic portrait',
      prompt: 'A person in an urban setting',
    })
    const videoAsset = createVideoAsset(staticAsset)

    const candidates = createBannerCandidates({
      strategy: { headline: 'Speak before you move', body: 'Practical Norwegian', cta: 'Start learning' },
      templates: [templates[0], templates[0]],
      staticAssets: [staticAsset, staticAsset],
      videoAssets: [videoAsset, videoAsset],
    })

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'banner-split-left-static-prompt-nordic-portrait-horizontal',
      'banner-split-left-static-prompt-nordic-portrait-vertical',
      'banner-split-left-static-prompt-nordic-portrait-square',
      'banner-split-left-video-static-prompt-nordic-portrait-vertical',
    ])
    expect(createBannerCandidates({
      templates: templates.slice(0, 1),
      staticAssets: [staticAsset],
      videoAssets: [videoAsset],
      format: 'Vertical',
      platform: 'Video Reels',
      media: 'video',
    }).map((candidate) => candidate.id)).toEqual([
      'banner-split-left-video-static-prompt-nordic-portrait-vertical',
    ])
  })

  test('does not allow final rendering before designer approval', () => {
    expect(canAdvance(6, { reviewStatus: 'in-review' })).toBe(false)
    expect(canAdvance(6, { reviewStatus: 'approved' })).toBe(true)
  })

  test('returns reflow decisions for the four required delivery formats', () => {
    const layouts = getResizeLayouts(templates[0])

    expect(layouts.map((item) => item.label)).toEqual([
      'Square',
      'Portrait',
      'Story',
      'Landscape',
    ])
    expect(layouts.map((item) => item.size)).toEqual([
      '1080×1080',
      '1080×1350',
      '1080×1920',
      '1200×628',
    ])
    expect(new Set(layouts.map((item) => item.layout)).size).toBeGreaterThan(1)
  })

  test('reports copy that exceeds the template content contract', () => {
    expect(getContentWarnings({ headline: 'A headline that is far too long for this banner layout '.repeat(2), body: 'Short', cta: 'Start', offer: '' })).toEqual([
      'Headline exceeds 54 characters',
    ])
    expect(getContentWarnings({ headline: 'Short headline', body: 'Short', cta: 'Start', offer: '' })).toEqual([])
  })

  test('binds approval to the exact creative that the designer reviewed', () => {
    const approved = createCreativeFingerprint({
      brief: 'Campaign idea',
      strategy: { headline: 'First version', body: 'Body', offer: 'Offer', cta: 'Go' },
      selectedVisualId: 'visual-01',
      selectedTemplateId: 'template-01',
    })
    const changed = createCreativeFingerprint({
      brief: 'Campaign idea',
      strategy: { headline: 'Changed version', body: 'Body', offer: 'Offer', cta: 'Go' },
      selectedVisualId: 'visual-01',
      selectedTemplateId: 'template-01',
    })

    expect(isApprovalCurrent(approved, approved)).toBe(true)
    expect(isApprovalCurrent(approved, changed)).toBe(false)
    expect(isApprovalCurrent(null, changed)).toBe(false)
  })

  test('accepts only a concrete HTTPS Figma link for designer approval', () => {
    expect(isValidFigmaUrl('https://www.figma.com/design/abc/campaign')).toBe(true)
    expect(isValidFigmaUrl('https://figma.com/file/abc')).toBe(true)
    expect(isValidFigmaUrl('javascript:alert(1)')).toBe(false)
    expect(isValidFigmaUrl('https://example.com/mockup')).toBe(false)
  })
})

describe('dashboard fixtures', () => {
  test('provides fixed history and production totals for the local dashboard demo', () => {
    expect(campaignHistory).toHaveLength(4)
    expect(productionTotals).toEqual({
      totalBanners: 46,
      totalReviews: 4,
      totalGenerations: 39,
      totalStaticVisuals: 29,
      totalVideos: 10,
      productionCost: 21.48,
      staticToVideoRatio: '2.9:1',
    })
    expect(dashboardMetrics).toEqual({
      totalBannersCreated: 46,
      totalReviews: 4,
      genAiProductionCost: 21.48,
      staticToVideoRatio: '2.9:1',
    })
  })
})

describe('template library', () => {
  test('contains exactly twenty distinct compositions', () => {
    expect(templates).toHaveLength(20)
    expect(new Set(templates.map((template) => template.id)).size).toBe(20)
    expect(new Set(templates.map((template) => template.layout)).size).toBeGreaterThanOrEqual(10)
  })
})
