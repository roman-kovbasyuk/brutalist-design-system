const validNodeEnvironments = new Set(['development', 'production', 'test'])

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

  return Object.freeze({
    nodeEnv,
    host: environment.HOST ?? '0.0.0.0',
    port: parsePort(environment.PORT),
    databaseUrl,
  })
}
