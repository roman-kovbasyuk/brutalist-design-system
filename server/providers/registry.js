export const GEMINI_TEXT_MODELS = Object.freeze(['gemini-3.5-flash'])
export const GEMINI_IMAGE_MODELS = Object.freeze(['gemini-3.1-flash-image'])
export const GEMINI_LOCATIONS = Object.freeze(['eu'])

const generationSteps = new Set(['brief_analysis', 'copy', 'directions', 'image'])

function freezeRegistry(provider, tuple) {
  return Object.freeze({ [provider]: Object.freeze([Object.freeze(tuple)]) })
}

export function createGenerationProviderRegistry({ provider, textModel, imageModel, region }) {
  if (provider === 'mock') {
    if (textModel !== 'mock-v1' || imageModel !== 'mock-v1' || region !== 'europe-west6') {
      throw new TypeError('The mock provider requires its approved model and region')
    }
    return freezeRegistry('mock', { model: textModel, region })
  }
  if (provider === 'gemini') {
    if (!GEMINI_TEXT_MODELS.includes(textModel) || !GEMINI_IMAGE_MODELS.includes(imageModel) || !GEMINI_LOCATIONS.includes(region)) {
      throw new TypeError('The Gemini provider requires approved text, image, and region values')
    }
    return freezeRegistry('gemini', { model: textModel, imageModel, region })
  }
  throw new TypeError('The generation provider is not approved')
}

export const generationProviderRegistry = createGenerationProviderRegistry({
  provider: 'mock', textModel: 'mock-v1', imageModel: 'mock-v1', region: 'europe-west6',
})

export function resolveProviderConfiguration(registry, configured, step) {
  if (!generationSteps.has(step)) return null
  const tuples = registry?.[configured?.provider]
  if (!Array.isArray(tuples)) return null
  const tuple = tuples.find((candidate) => candidate.model === configured.model && candidate.region === configured.region)
  if (!tuple) return null
  return Object.freeze({
    provider: configured.provider,
    model: step === 'image' ? (tuple.imageModel ?? tuple.model) : tuple.model,
    region: tuple.region,
  })
}

export function providerTupleAllowed(registry, value) {
  const tuples = registry?.[value?.provider]
  if (!Array.isArray(tuples)) return false
  if (value?.step === undefined) {
    return tuples.some((tuple) => tuple.model === value.model && tuple.region === value.region)
  }
  if (!generationSteps.has(value.step)) return false
  return tuples.some((tuple) => {
    const expectedModel = value.step === 'image' ? (tuple.imageModel ?? tuple.model) : tuple.model
    return expectedModel === value.model && tuple.region === value.region
  })
}

export function assertProviderRegistry(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('A server-controlled generation provider registry is required')
  }
  for (const [provider, tuples] of Object.entries(registry)) {
    if (!provider.trim() || !Array.isArray(tuples) || tuples.length !== 1) {
      throw new TypeError('Every registered provider requires exactly one model and region tuple')
    }
    for (const tuple of tuples) {
      if (typeof tuple?.model !== 'string' || !tuple.model.trim() || typeof tuple?.region !== 'string' || !tuple.region.trim()) {
        throw new TypeError('Provider registry tuples require model and region')
      }
      if (tuple.imageModel !== undefined && (typeof tuple.imageModel !== 'string' || !tuple.imageModel.trim())) {
        throw new TypeError('Provider registry image models must be non-empty strings')
      }
    }
  }
  return registry
}
