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

export function installShutdownHandlers(runtime, { processLike = process, logger = console } = {}) {
  let shutdownPromise
  const shutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = runtime.close().catch((error) => {
        logger.error('Banner Studio shutdown failed', error)
        processLike.exitCode = 1
      })
    }
    return shutdownPromise
  }

  processLike.once('SIGTERM', () => { void shutdown() })
  processLike.once('SIGINT', () => { void shutdown() })
  return shutdown
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then((runtime) => {
    installShutdownHandlers(runtime)
  }).catch((error) => {
    console.error('Banner Studio failed to start', error)
    process.exitCode = 1
  })
}
