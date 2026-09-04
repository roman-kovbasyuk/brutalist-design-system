import { hashCanonical } from '../../shared/canonicalJson.js'
import {
  analyseBriefInputSchema,
  analyseBriefResultSchema,
  generateCopyInputSchema,
  generateCopyResultSchema,
  generateDirectionsInputSchema,
  generateDirectionsResultSchema,
  generateImageInputSchema,
  generateImageResultSchema,
} from '../../shared/contracts.js'

const pngPixel = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))

function abortIfNeeded(signal) {
  if (!(signal instanceof AbortSignal)) throw new TypeError('Mock provider requires an AbortSignal')
  if (signal.aborted) throw new DOMException('The generation request was aborted', 'AbortError')
}

function metadata({ model, region, input, outputUnits, actualCostMicrounits, blocked = false }) {
  return {
    provider: 'mock', model, region,
    usage: { inputUnits: JSON.stringify(input).length, outputUnits },
    actualCostMicrounits,
    safety: { verdict: blocked ? 'blocked' : 'safe', categories: blocked ? ['mock_policy'] : [] },
  }
}

function isBlocked(value) {
  return JSON.stringify(value).toLowerCase().includes('[blocked]')
}

function blockedResult(options, input) {
  return {
    ...metadata({ ...options, input, outputUnits: 0, actualCostMicrounits: 0, blocked: true }),
    error: { code: 'provider_blocked', message: 'The provider blocked this request for safety reasons.', retryable: false },
  }
}

function short(value, limit) {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

export function createMockProvider({ model = 'mock-v1', region = 'europe-west6' } = {}) {
  const options = { model, region }
  return Object.freeze({
    async analyseBrief(input, signal) {
      abortIfNeeded(signal)
      const command = analyseBriefInputSchema.parse(input)
      if (isBlocked(command)) return analyseBriefResultSchema.parse(blockedResult(options, command))
      const analysis = {
        summary: short(`${command.brief.product} for ${command.brief.audience}, focused on ${command.brief.objective}.`, 1_000),
        themes: [command.brief.objective, command.brief.offer || 'clear value', 'confident simplicity'],
        warnings: command.brief.notes.toLowerCase().includes('personal data') ? ['Review the brief for personal data before publishing.'] : [],
      }
      return analyseBriefResultSchema.parse({ ...metadata({ ...options, input: command, outputUnits: 36, actualCostMicrounits: 80 }), analysis })
    },

    async generateCopy(input, signal) {
      abortIfNeeded(signal)
      const command = generateCopyInputSchema.parse(input)
      if (isBlocked(command)) return generateCopyResultSchema.parse(blockedResult(options, command))
      const seed = hashCanonical(command)
      const angles = [
        ['Make progress with', 'Build momentum through short, focused sessions designed for', 'Start learning'],
        ['A clearer way to choose', 'A practical path for', 'Explore the offer'],
        ['Your next step:', 'Turn intention into action with a focused experience for', 'Get started'],
      ]
      const copies = angles.map(([lead, bodyLead, cta], index) => ({
        id: `copy-${seed.slice(index * 8, index * 8 + 8)}`,
        headline: short(`${lead} ${command.brief.product}`, 160),
        body: short(`${bodyLead} ${command.brief.audience}. ${command.brief.offer}`.trim(), 500),
        offer: short(command.brief.offer, 200),
        cta,
        visualPrompt: short(`Editorial campaign visual for ${command.brief.product}; ${command.analysis.themes.join(', ')}; locale ${command.brief.locale}.`, 2_000),
      }))
      return generateCopyResultSchema.parse({ ...metadata({ ...options, input: command, outputUnits: 180, actualCostMicrounits: 240 }), copies })
    },

    async generateDirections(input, signal) {
      abortIfNeeded(signal)
      const command = generateDirectionsInputSchema.parse(input)
      if (isBlocked(command)) return generateDirectionsResultSchema.parse(blockedResult(options, command))
      const seed = hashCanonical(command)
      const concepts = [
        ['Nordic focus', 'Soft daylight, natural texture, quiet confidence'],
        ['Bold momentum', 'Graphic diagonal movement, crisp contrast, energetic crop'],
        ['Human progress', 'Authentic candid moment, warm light, generous negative space'],
        ['Product clarity', 'Clean studio still life, exact details, restrained palette'],
        ['Editorial story', 'Magazine composition, tactile layers, premium art direction'],
      ]
      const directions = concepts.map(([title, style], index) => ({
        id: `direction-${seed.slice(index * 6, index * 6 + 6)}`,
        title,
        prompt: short(`${style}. Communicate “${command.copy.headline}” for ${command.brief.audience}. No embedded text or logos.`, 2_000),
        status: 'pending',
        previewAssetId: null,
      }))
      return generateDirectionsResultSchema.parse({ ...metadata({ ...options, input: command, outputUnits: 260, actualCostMicrounits: 320 }), directions })
    },

    async generateImage(input, signal) {
      abortIfNeeded(signal)
      const command = generateImageInputSchema.parse(input)
      if (isBlocked(command)) return generateImageResultSchema.parse(blockedResult(options, command))
      return generateImageResultSchema.parse({
        ...metadata({ ...options, input: command, outputUnits: command.width * command.height, actualCostMicrounits: 1_000 }),
        image: { bytes: new Uint8Array(pngPixel), mimeType: 'image/png', width: command.width, height: command.height },
      })
    },
  })
}
