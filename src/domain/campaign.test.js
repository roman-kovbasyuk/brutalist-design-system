import { describe, expect, test } from 'vitest'
import {
  analyzeBrief,
  canAdvance,
  createCreativeFingerprint,
  generateVisuals,
  getContentWarnings,
  getResizeLayouts,
  isApprovalCurrent,
  isValidFigmaUrl,
} from './campaign.js'
import { templates } from '../data/templates.js'

describe('campaign domain', () => {
  test('rejects an empty brief so generation cannot silently invent a campaign', () => {
    expect(() => analyzeBrief('   ')).toThrow('Добавьте идею кампании')
  })

  test('turns a free-form brief into usable campaign copy and media prompts', () => {
    const strategy = analyzeBrief(
      'Запускаем интенсив норвежского языка. Скидка 15% до воскресенья для тех, кто переезжает в Осло.',
    )

    expect(strategy).toMatchObject({
      audience: 'Люди, которые планируют переезд и хотят быстрее заговорить',
      offer: 'Скидка 15% на интенсив',
      headline: 'Заговорите до переезда',
      cta: 'Начать обучение',
    })
    expect(strategy.imagePrompt).toContain('editorial campaign image')
    expect(strategy.videoPrompt).toContain('vertical motion loop')
  })

  test('generates exactly five client-selectable visual directions', () => {
    const visuals = generateVisuals(analyzeBrief('Курс языка для переезда со скидкой 15%'))

    expect(visuals).toHaveLength(5)
    expect(new Set(visuals.map((visual) => visual.id)).size).toBe(5)
    expect(visuals.every((visual) => visual.prompt.length > 20)).toBe(true)
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
    expect(getContentWarnings({ headline: 'Очень длинный заголовок '.repeat(4), body: 'Коротко', cta: 'Начать', offer: '' })).toEqual([
      'Заголовок длиннее 54 символов',
    ])
    expect(getContentWarnings({ headline: 'Короткий заголовок', body: 'Коротко', cta: 'Начать', offer: '' })).toEqual([])
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

describe('template library', () => {
  test('contains exactly twenty distinct compositions', () => {
    expect(templates).toHaveLength(20)
    expect(new Set(templates.map((template) => template.id)).size).toBe(20)
    expect(new Set(templates.map((template) => template.layout)).size).toBeGreaterThanOrEqual(10)
  })
})
