const mockTuples = Object.freeze([
  Object.freeze({ model: 'mock-v1', region: 'europe-west6' }),
])

export const generationProviderRegistry = Object.freeze({ mock: mockTuples })

export function providerTupleAllowed(registry, { provider, model, region }) {
  const tuples = registry?.[provider]
  return Array.isArray(tuples) && tuples.some((tuple) => tuple?.model === model && tuple?.region === region)
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
    }
  }
  return registry
}
