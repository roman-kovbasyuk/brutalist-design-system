import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DockerfileParser, Keyword } from 'dockerfile-ast'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const parserVersion = 'dockerfile-ast@0.7.1'
const knownInstructions = new Set(Object.values(Keyword))
const requiredArguments = new Set([...knownInstructions].filter((keyword) => keyword !== Keyword.ARG))
const jsonInstructions = new Set([
  Keyword.ADD, Keyword.CMD, Keyword.COPY, Keyword.ENTRYPOINT, Keyword.RUN, Keyword.SHELL, Keyword.VOLUME,
])

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message)
}

function parseJsonForm(value, instruction) {
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(`Dockerfile diagnostic: ${instruction} has an invalid JSON form`, { cause: error })
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Dockerfile diagnostic: ${instruction} JSON form must be a non-empty string array`)
  }
}

function hasDanglingEscape(source, escapeCharacter) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && lines.at(-1).trim() === '') lines.pop()
  const lastLine = lines.at(-1)?.replace(/[ \t]+$/, '') ?? ''
  let count = 0
  for (let index = lastLine.length - 1; index >= 0 && lastLine[index] === escapeCharacter; index -= 1) count += 1
  return count % 2 === 1
}

function validateShellRun(argumentsContent) {
  const result = spawnSync('/bin/sh', ['-n'], {
    input: `${argumentsContent}\n`,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    throw new Error('Dockerfile diagnostic: RUN contains invalid shell syntax', { cause: result.error })
  }
}

function validateAst(source) {
  const dockerfile = DockerfileParser.parse(source)
  if (hasDanglingEscape(source, dockerfile.getEscapeCharacter())) {
    throw new Error('Dockerfile diagnostic: dangling escape continuation at end of file')
  }
  const instructions = dockerfile.getInstructions()
  for (const instruction of instructions) {
    const keyword = instruction.getKeyword()?.toUpperCase()
    const argumentsContent = instruction.getArgumentsContent()?.trim() ?? ''
    if (!knownInstructions.has(keyword)) {
      throw new Error(`Unknown Dockerfile instruction: ${keyword || '<empty>'}`)
    }
    if (requiredArguments.has(keyword) && !argumentsContent) {
      throw new Error(`Dockerfile diagnostic: ${keyword} requires an argument`)
    }
    if (jsonInstructions.has(keyword) && argumentsContent.startsWith('[')) {
      parseJsonForm(argumentsContent, keyword)
    }
    if (keyword === Keyword.RUN && !argumentsContent.startsWith('[')) validateShellRun(argumentsContent)
    if (keyword === Keyword.HEALTHCHECK) {
      const healthCommand = argumentsContent.match(/^CMD\s+(\[[\s\S]*\])$/i)?.[1]
      if (healthCommand) parseJsonForm(healthCommand, keyword)
    }
  }
  return dockerfile
}

function parseEnvironment(dockerfile) {
  const environment = new Map()
  for (const instruction of dockerfile.getInstructions()) {
    if (instruction.getKeyword()?.toUpperCase() !== Keyword.ENV) continue
    for (const assignment of instruction.getArgumentsContent().trim().split(/\s+/)) {
      const separator = assignment.indexOf('=')
      if (separator > 0) environment.set(assignment.slice(0, separator), assignment.slice(separator + 1))
    }
  }
  return environment
}

export async function verifyContainerConfiguration({ dockerfile, dockerignore } = {}) {
  const source = dockerfile ?? await readFile(resolve(repositoryRoot, 'Dockerfile'), 'utf8')
  const ignore = dockerignore ?? await readFile(resolve(repositoryRoot, '.dockerignore'), 'utf8')
  const parsed = validateAst(source)
  const fromInstructions = parsed.getFROMs()

  if (fromInstructions.length !== 2) throw new Error('Container must use exactly two build and runtime stages')
  const pinnedNode = /^node:22\.\d+\.\d+-alpine\d+\.\d+@sha256:[a-f0-9]{64}$/
  for (const instruction of fromInstructions) {
    requireMatch(instruction.getImage(), pinnedNode, 'Every container stage must use an exact digest-pinned Node 22 Alpine image')
  }
  if (fromInstructions[0].getImage() !== fromInstructions[1].getImage()) {
    throw new Error('Build and runtime stages must use the same pinned Node image')
  }
  if (fromInstructions[0].getBuildStage()?.toLowerCase() !== 'builder' || fromInstructions[1].getBuildStage()?.toLowerCase() !== 'runtime') {
    throw new Error('Container stages must be named builder and runtime')
  }

  requireMatch(source, /^RUN\s+.*npm ci\b/m, 'Builder must use npm ci')
  requireMatch(source, /^RUN\s+.*npm run build.*npm prune --omit=dev\b/m, 'Runtime must contain production-only dependencies after the build')
  requireMatch(source, /^COPY --from=builder \/app\/node_modules \.\/node_modules$/m, 'Runtime must copy the pruned production dependencies')
  for (const directory of ['server', 'shared', 'dist']) {
    requireMatch(source, new RegExp(`^COPY --from=builder /app/${directory} \\.\/${directory}$`, 'm'), `Runtime must copy ${directory}`)
  }
  if (/^COPY --from=builder --chown=/m.test(source)) {
    throw new Error('Runtime artifacts must remain root-owned')
  }
  requireMatch(
    source,
    /^RUN chmod -R a-w \/app\/package\.json \/app\/package-lock\.json \/app\/node_modules \/app\/server \/app\/shared \/app\/dist$/m,
    'Runtime code, dependencies, and static artifacts must be read-only to the node user',
  )
  requireMatch(source, /^USER node$/m, 'Runtime must execute as the non-root Node user')
  requireMatch(source, /^EXPOSE 8080$/m, 'Runtime must expose port 8080')
  requireMatch(source, /^STOPSIGNAL SIGTERM$/m, 'Runtime must use SIGTERM for graceful shutdown')
  requireMatch(source, /^HEALTHCHECK[\s\S]*\/healthz/m, 'Runtime must define a /healthz health check')
  const commands = parsed.getInstructions().filter((instruction) => instruction.getKeyword()?.toUpperCase() === Keyword.CMD)
  const command = commands.at(-1)?.getArgumentsContent() ?? ''
  if (/migrat/i.test(command)) throw new Error('Container startup must not run database migrations')
  if (command !== '["node", "server/start.js"]') throw new Error('Runtime must start the Fastify Node server directly')
  if (/nginx/i.test(source)) throw new Error('Nginx must not be present in the one-container runtime')

  if (/^(?:ARG|ENV)\s+[^\n]*(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY)/gmi.test(source)) {
    throw new Error('Container must not define secret-bearing build arguments or environment values')
  }

  const environment = parseEnvironment(parsed)
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
    stages: fromInstructions.length,
    runtimeUser: 'node',
    port: Number(environment.get('PORT')),
    staticRoot: environment.get('STATIC_ROOT'),
    image: fromInstructions[1].getImage(),
    parser: parserVersion,
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
