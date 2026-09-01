import { visualSeeds } from '../data/visuals.js'

export function analyzeBrief(brief) {
  const normalized = brief?.trim()
  if (!normalized) throw new Error('Добавьте идею кампании')

  const languageCampaign = /язык|норвеж|переезд|осло/i.test(normalized)
  const percent = normalized.match(/\d+%/)?.[0] ?? '15%'

  const copy = languageCampaign
    ? {
        audience: 'Люди, которые планируют переезд и хотят быстрее заговорить',
        goal: 'Конверсия в запись на интенсив',
        offer: `Скидка ${percent} на интенсив`,
        headline: 'Заговорите до переезда',
        body: 'Практический норвежский для реальных разговоров — от первой недели обучения.',
        cta: 'Начать обучение',
      }
    : {
        audience: 'Люди, которым нужен понятный и быстрый способ попробовать продукт',
        goal: 'Получить целевые заявки из рекламной кампании',
        offer: 'Специальное предложение для новых клиентов',
        headline: 'Идея, которую хочется попробовать',
        body: 'Понятная польза продукта, собранная в один короткий рекламный сюжет.',
        cta: 'Узнать больше',
      }

  return {
    ...copy,
    sourceBrief: normalized,
    imagePrompt:
      'editorial campaign image, tactile natural light, clear subject separation, generous copy space, premium art direction, no text, no logos',
    videoPrompt:
      'vertical motion loop, subtle camera travel, one clear subject, natural parallax, deliberate negative space for headline, no text, six seconds',
  }
}

export function generateVisuals(strategy) {
  return visualSeeds.map((seed, index) => ({
    ...seed,
    prompt: `${strategy.imagePrompt}; direction ${index + 1}: ${seed.direction.toLowerCase()}`,
  }))
}

export function canAdvance(step, state) {
  if (step === 1) return Boolean(state.brief?.trim())
  if (step === 2) return Boolean(state.strategy)
  if (step === 3 || step === 4) return Boolean(state.selectedVisualId)
  if (step === 5) return Boolean(state.selectedTemplateId)
  if (step === 6) return state.reviewStatus === 'approved'
  return false
}

export function getResizeLayouts(template) {
  const verticalLayout = template?.family === 'split' ? 'stacked-split' : 'vertical-overlay'
  return [
    { label: 'Square', size: '1080×1080', ratio: '1 / 1', layout: 'balanced-square' },
    { label: 'Portrait', size: '1080×1350', ratio: '4 / 5', layout: 'portrait-master' },
    { label: 'Story', size: '1080×1920', ratio: '9 / 16', layout: verticalLayout },
    { label: 'Landscape', size: '1200×628', ratio: '1200 / 628', layout: 'wide-reflow' },
  ]
}

export function getContentWarnings(content) {
  const limits = [
    ['headline', 54, 'Заголовок'],
    ['body', 120, 'Основной текст'],
    ['offer', 28, 'Оффер'],
    ['cta', 24, 'CTA'],
  ]
  return limits
    .filter(([field, limit]) => (content?.[field]?.trim().length ?? 0) > limit)
    .map(([, limit, label]) => `${label} длиннее ${limit} символов`)
}

export function createCreativeFingerprint({ brief, strategy, selectedVisualId, selectedTemplateId }) {
  return JSON.stringify({
    brief: brief?.trim() ?? '',
    headline: strategy?.headline ?? '',
    body: strategy?.body ?? '',
    offer: strategy?.offer ?? '',
    cta: strategy?.cta ?? '',
    selectedVisualId: selectedVisualId ?? '',
    selectedTemplateId: selectedTemplateId ?? '',
  })
}

export function isApprovalCurrent(approvedFingerprint, currentFingerprint) {
  return Boolean(approvedFingerprint && approvedFingerprint === currentFingerprint)
}

export function isValidFigmaUrl(value) {
  try {
    const url = new URL(value)
    const isFigmaHost = url.hostname === 'figma.com' || url.hostname === 'www.figma.com'
    return url.protocol === 'https:' && isFigmaHost && /^\/(design|file|proto|board)\/[^/]+/i.test(url.pathname)
  } catch {
    return false
  }
}
