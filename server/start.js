import { buildApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig(process.env)
const app = buildApp()
let shutdownPromise

async function shutdown() {
  if (!shutdownPromise) {
    shutdownPromise = app.close().catch((error) => {
      console.error('Banner Studio shutdown failed', error)
      process.exitCode = 1
    })
  }

  return shutdownPromise
}

async function start() {
  try {
    await app.listen({ host: config.host, port: config.port })
  } catch (error) {
    console.error('Banner Studio failed to start', error)
    process.exitCode = 1
    await shutdown()
  }
}

process.once('SIGTERM', () => { void shutdown() })
process.once('SIGINT', () => { void shutdown() })

await start()
