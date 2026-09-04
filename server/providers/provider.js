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

const operations = Object.freeze({
  analyseBrief: { input: analyseBriefInputSchema, result: analyseBriefResultSchema },
  generateCopy: { input: generateCopyInputSchema, result: generateCopyResultSchema },
  generateDirections: { input: generateDirectionsInputSchema, result: generateDirectionsResultSchema },
  generateImage: { input: generateImageInputSchema, result: generateImageResultSchema },
})

export function validateGenerationProvider(provider) {
  if (!provider || typeof provider !== 'object') throw new TypeError('A generation provider is required')
  for (const method of Object.keys(operations)) {
    if (typeof provider[method] !== 'function') throw new TypeError(`Generation provider must implement ${method}`)
  }
  return provider
}

export async function invokeProvider(provider, operation, input, signal) {
  validateGenerationProvider(provider)
  const contract = operations[operation]
  if (!contract) throw new TypeError(`Unknown generation provider operation ${operation}`)
  if (!(signal instanceof AbortSignal)) throw new TypeError('Generation provider calls require an AbortSignal')
  const validatedInput = contract.input.parse(input)
  const result = await provider[operation](validatedInput, signal)
  return contract.result.parse(result)
}
