import { fileURLToPath } from 'node:url'
import { createServerRuntime } from './bootstrap.js'

export async function startServer({ environment = process.env, runtimeFactory = createServerRuntime } = {}) {
  const runtime = await runtimeFactory({ environment })
  try {
    await runtime.app.listen({ host: runtime.config.host, port: runtime.config.port })
    return runtime
  } catch (error) {
    await runtime.close().catch(() => {})
    throw error
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then((runtime) => {
    let shuttingDown = false
    const shutdown = async () => {
      if (shuttingDown) return
      shuttingDown = true
      try {
        await runtime.close()
      } catch (error) {
        console.error('Banner Studio shutdown failed', error)
        process.exitCode = 1
      }
    }
    process.once('SIGTERM', () => { void shutdown() })
    process.once('SIGINT', () => { void shutdown() })
  }).catch((error) => {
    console.error('Banner Studio failed to start', error)
    process.exitCode = 1
  })
}
