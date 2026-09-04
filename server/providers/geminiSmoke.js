import { loadConfig } from '../config.js'
import { createGeminiProvider } from './geminiProvider.js'

export async function runGeminiSmoke({
  environment = process.env,
  createProvider = createGeminiProvider,
  write = console.log,
} = {}) {
  if (environment.GEMINI_SMOKE_ENABLED !== 'true') {
    write('Gemini smoke test disabled; no provider call was made.')
    return false
  }
  const config = loadConfig(environment)
  if (config.generation.provider !== 'gemini') throw new Error('Gemini smoke requires GENERATION_PROVIDER=gemini')
  const provider = createProvider({
    project: config.generation.projectId,
    location: config.generation.location,
    textModel: config.generation.textModel,
    imageModel: config.generation.imageModel,
  })
  try {
    const result = await provider.analyseBrief({
      brief: {
        product: 'Banner Studio smoke check',
        audience: 'Internal operators',
        objective: 'Verify configured generation',
        offer: '',
        locale: 'en',
        notes: 'Return a concise analysis.',
      },
    }, new AbortController().signal)
    if (result?.error || result?.safety?.verdict === 'blocked') {
      const code = result?.error?.code ?? 'provider_blocked'
      throw new Error(`Gemini smoke failed: ${code}`)
    }
    write(JSON.stringify({
      provider: result.provider,
      model: result.model,
      region: result.region,
      safety: result.safety.verdict,
      errorCode: result.error?.code ?? null,
      actualCostMicrounits: result.actualCostMicrounits,
    }))
    return true
  } finally {
    await provider.close?.()
  }
}
