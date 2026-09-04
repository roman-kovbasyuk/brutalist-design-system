import { GEMINI_IMAGE_MODELS, GEMINI_LOCATIONS, GEMINI_TEXT_MODELS } from './providers/registry.js'

const validNodeEnvironments = new Set(['development', 'production', 'test'])
const validGenerationProviders = new Set(['mock', 'gemini'])

function parsePort(value) {
  if (value === undefined) return 3000
  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  return port
}

export function loadConfig(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error('Environment configuration must be an object')
  }

  const nodeEnv = environment.NODE_ENV ?? 'development'
  if (!validNodeEnvironments.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production')
  }

  const databaseUrl = environment.DATABASE_URL
  if (nodeEnv === 'production' && !databaseUrl) {
    throw new Error('DATABASE_URL is required in production')
  }
  const firebaseProjectId = environment.FIREBASE_PROJECT_ID?.trim()
  if (nodeEnv === 'production' && !firebaseProjectId) {
    throw new Error('FIREBASE_PROJECT_ID is required in production')
  }
  const generationProvider = environment.GENERATION_PROVIDER?.trim() || 'mock'
  if (!validGenerationProviders.has(generationProvider)) {
    throw new Error('GENERATION_PROVIDER must be an approved provider')
  }
  if (nodeEnv === 'production' && generationProvider !== 'gemini') {
    throw new Error('GENERATION_PROVIDER=gemini is required in production')
  }
  const vertexProjectId = environment.VERTEX_AI_PROJECT_ID?.trim()
  if (generationProvider === 'gemini' && !vertexProjectId) {
    throw new Error('VERTEX_AI_PROJECT_ID is required for Gemini')
  }
  const vertexLocation = environment.VERTEX_AI_LOCATION?.trim() || GEMINI_LOCATIONS[0]
  const textModel = environment.GEMINI_TEXT_MODEL?.trim() || GEMINI_TEXT_MODELS[0]
  const imageModel = environment.GEMINI_IMAGE_MODEL?.trim() || GEMINI_IMAGE_MODELS[0]
  if (!GEMINI_LOCATIONS.includes(vertexLocation)) throw new Error('VERTEX_AI_LOCATION must be an approved Gemini location')
  if (!GEMINI_TEXT_MODELS.includes(textModel)) throw new Error('GEMINI_TEXT_MODEL must be an approved Gemini text model')
  if (!GEMINI_IMAGE_MODELS.includes(imageModel)) throw new Error('GEMINI_IMAGE_MODEL must be an approved Gemini image model')

  return Object.freeze({
    nodeEnv,
    host: environment.HOST ?? '0.0.0.0',
    port: parsePort(environment.PORT),
    databaseUrl,
    firebaseProjectId,
    generation: Object.freeze({
      provider: generationProvider,
      projectId: vertexProjectId,
      location: vertexLocation,
      textModel,
      imageModel,
    }),
  })
}
