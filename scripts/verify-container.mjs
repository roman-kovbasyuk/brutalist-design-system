import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message)
}

function parseEnvironment(dockerfile) {
  const environment = new Map()
  const logicalLines = dockerfile.replace(/\\\s*\n/g, ' ')
  for (const match of logicalLines.matchAll(/^ENV\s+(.+)$/gm)) {
    for (const assignment of match[1].trim().split(/\s+/)) {
      const separator = assignment.indexOf('=')
      if (separator > 0) environment.set(assignment.slice(0, separator), assignment.slice(separator + 1))
    }
  }
  return environment
}

export async function verifyContainerConfiguration({ dockerfile, dockerignore } = {}) {
  const source = dockerfile ?? await readFile(resolve(repositoryRoot, 'Dockerfile'), 'utf8')
  const ignore = dockerignore ?? await readFile(resolve(repositoryRoot, '.dockerignore'), 'utf8')
  const fromLines = [...source.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+([^\s]+))?$/gmi)]

  if (fromLines.length !== 2) throw new Error('Container must use exactly two build and runtime stages')
  const pinnedNode = /^node:22\.\d+\.\d+-alpine\d+\.\d+@sha256:[a-f0-9]{64}$/
  for (const [, image] of fromLines) requireMatch(image, pinnedNode, 'Every container stage must use an exact digest-pinned Node 22 Alpine image')
  if (fromLines[0][1] !== fromLines[1][1]) throw new Error('Build and runtime stages must use the same pinned Node image')
  if (fromLines[0][2]?.toLowerCase() !== 'builder' || fromLines[1][2]?.toLowerCase() !== 'runtime') {
    throw new Error('Container stages must be named builder and runtime')
  }

  requireMatch(source, /^RUN\s+.*npm ci\b/m, 'Builder must use npm ci')
  requireMatch(source, /^RUN\s+.*npm run build.*npm prune --omit=dev\b/m, 'Runtime must contain production-only dependencies after the build')
  requireMatch(source, /^COPY --from=builder .*\/app\/node_modules .*node_modules$/m, 'Runtime must copy the pruned production dependencies')
  for (const directory of ['server', 'shared', 'dist']) {
    requireMatch(source, new RegExp(`^COPY --from=builder .* /app/${directory} \\./${directory}$`, 'm'), `Runtime must copy ${directory}`)
  }
  requireMatch(source, /^USER node$/m, 'Runtime must execute as the non-root Node user')
  requireMatch(source, /^EXPOSE 8080$/m, 'Runtime must expose port 8080')
  requireMatch(source, /^STOPSIGNAL SIGTERM$/m, 'Runtime must use SIGTERM for graceful shutdown')
  requireMatch(source, /^HEALTHCHECK[\s\S]*\/healthz/m, 'Runtime must define a /healthz health check')
  const command = source.match(/^CMD\s+(.+)$/gm)?.at(-1) ?? ''
  if (/migrat/i.test(command)) throw new Error('Container startup must not run database migrations')
  requireMatch(source, /^CMD \["node", "server\/start\.js"\]$/m, 'Runtime must start the Fastify Node server directly')
  if (/nginx/i.test(source)) throw new Error('Nginx must not be present in the one-container runtime')

  if (/^(?:ARG|ENV)\s+[^\n]*(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY)/gmi.test(source)) {
    throw new Error('Container must not define secret-bearing build arguments or environment values')
  }

  const environment = parseEnvironment(source)
  if (environment.get('NODE_ENV') !== 'production') throw new Error('Runtime must set NODE_ENV=production')
  if (environment.get('SERVE_STATIC') !== 'true') throw new Error('Runtime must enable production static serving')
  if (environment.get('STATIC_ROOT') !== '/app/dist') throw new Error('Runtime must serve the copied /app/dist build')
  if (environment.get('PORT') !== '8080') throw new Error('Runtime must set PORT=8080')
  if (environment.get('RUN_MIGRATIONS') !== 'false') throw new Error('Runtime must keep migrations as an explicit release step')

  const ignored = new Set(ignore.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')))
  for (const required of ['.git', '.env*', 'node_modules', 'dist']) {
    if (!ignored.has(required)) {
      const label = required === '.env*' ? 'environment files' : required
      throw new Error(`Docker build context must exclude ${label}`)
    }
  }

  return Object.freeze({
    stages: fromLines.length,
    runtimeUser: 'node',
    port: Number(environment.get('PORT')),
    staticRoot: environment.get('STATIC_ROOT'),
    image: fromLines[1][1],
  })
}

async function main() {
  const result = await verifyContainerConfiguration()
  process.stdout.write(`Verified ${result.stages}-stage ${result.image} container running as ${result.runtimeUser}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
