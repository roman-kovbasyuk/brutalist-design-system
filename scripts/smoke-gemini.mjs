import { runGeminiSmoke } from '../server/providers/geminiSmoke.js'

runGeminiSmoke().catch(() => {
  console.error('Gemini smoke test failed without exposing provider details.')
  process.exitCode = 1
})
