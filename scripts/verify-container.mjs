import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DockerfileParser, Keyword } from 'dockerfile-ast'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const parserVersion = 'dockerfile-ast@0.7.1'
const knownInstructions = new Set(Object.values(Keyword))
const requiredArguments = new Set(knownInstructions)
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
  return parsed
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

function shellArguments(value, keyword) {
  const result = []
  let current = ''
  let quote = null
  let escaped = false
  let started = false

  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      started = true
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      started = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else current += character
      started = true
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      started = true
      continue
    }
    if (/\s/.test(character)) {
      if (started) {
        result.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += character
    started = true
  }

  if (escaped || quote) throw new Error(`Dockerfile diagnostic: ${keyword} contains invalid quoted arguments`)
  if (started) result.push(current)
  return result
}

function instructionArguments(keyword, argumentsContent) {
  if (argumentsContent.startsWith('[')) return parseJsonForm(argumentsContent, keyword)
  return shellArguments(argumentsContent, keyword)
}

function requireOneArgument(keyword, argumentsContent) {
  const values = instructionArguments(keyword, argumentsContent)
  if (values.length !== 1 || values[0] === '') {
    throw new Error(`Dockerfile diagnostic: ${keyword} requires exactly one argument`)
  }
}

function validateCopyOrAdd(keyword, argumentsContent) {
  const values = instructionArguments(keyword, argumentsContent)
  if (values.length < 2 || values.some((value) => value === '')) {
    throw new Error(`Dockerfile diagnostic: ${keyword} requires at least one source and one destination`)
  }
}

function validateEnvironment(instruction) {
  const properties = instruction.getProperties?.() ?? []
  if (properties.length === 0 || properties.some((property) => !property.getName() || property.getValue() === null)) {
    throw new Error('Dockerfile diagnostic: ENV requires a key and value assignment')
  }
}

function validateFlags(instruction, keyword, allowedNames, noun = 'flag') {
  const flags = instruction.getFlags?.() ?? []
  const values = new Map()
  for (const flag of flags) {
    const name = flag.getName?.() ?? ''
    if (!allowedNames.has(name)) throw new Error(`Dockerfile diagnostic: ${keyword} contains an unknown ${noun}: --${name}`)
    if (values.has(name)) throw new Error(`Dockerfile diagnostic: ${keyword} contains a duplicate ${noun}: --${name}`)
    values.set(name, flag.getValue?.())
  }
  return values
}

function validateHealthcheck(instruction, argumentsContent) {
  const durationOptions = new Set(['interval', 'timeout', 'start-period', 'start-interval'])
  const allowedOptions = new Set([...durationOptions, 'retries'])
  const options = validateFlags(instruction, Keyword.HEALTHCHECK, allowedOptions, 'option')
  if (/^NONE$/i.test(argumentsContent)) {
    if (options.size > 0) throw new Error('Dockerfile diagnostic: HEALTHCHECK NONE cannot use options')
    return
  }
  const duration = /^(?:[1-9]\d*(?:ns|us|ms|s|m|h))+$/
  for (const name of durationOptions) {
    if (options.has(name) && !duration.test(options.get(name) ?? '')) {
      throw new Error(`Dockerfile diagnostic: HEALTHCHECK --${name} requires a positive Docker duration`)
    }
  }
  if (options.has('retries') && !/^[1-9]\d*$/.test(options.get('retries') ?? '')) {
    throw new Error('Dockerfile diagnostic: HEALTHCHECK --retries requires a positive integer')
  }
  const match = argumentsContent.match(/^CMD(?:\s+([\s\S]+))?$/i)
  if (!match) throw new Error('Dockerfile diagnostic: HEALTHCHECK must use NONE or options followed by CMD')
  const command = match[1]?.trim() ?? ''
  if (!command) throw new Error('Dockerfile diagnostic: HEALTHCHECK CMD requires a command')
  if (command.startsWith('[')) {
    const values = parseJsonForm(command, Keyword.HEALTHCHECK)
    if (!values[0]) throw new Error('Dockerfile diagnostic: HEALTHCHECK CMD requires a command')
  } else {
    const values = shellArguments(command, Keyword.HEALTHCHECK)
    if (!values[0]) throw new Error('Dockerfile diagnostic: HEALTHCHECK CMD requires a command')
    validateShellRun(command)
  }
}

function validateCopyOrAddStage(instruction, keyword, currentStage, stageAliases) {
  const flags = validateFlags(instruction, keyword, new Set(['from']))
  if (!flags.has('from')) return
  const reference = flags.get('from') ?? ''
  if (!reference) throw new Error(`Dockerfile diagnostic: ${keyword} --from requires a stage value`)

  let referencedStage
  if (/^(?:0|[1-9]\d*)$/.test(reference)) referencedStage = Number(reference)
  else referencedStage = stageAliases.get(reference.toLowerCase())
  if (referencedStage === undefined) {
    throw new Error(`Dockerfile diagnostic: ${keyword} --from must reference a declared local stage`)
  }
  if (referencedStage >= currentStage) {
    throw new Error(`Dockerfile diagnostic: ${keyword} --from must reference an earlier stage`)
  }
}

function validateInstructionSemantics(instruction, keyword, argumentsContent, { currentStage, stageAliases }) {
  if (keyword === Keyword.ENTRYPOINT) {
    throw new Error('Dockerfile diagnostic: ENTRYPOINT is not permitted; use the single direct runtime CMD')
  }
  if (keyword === Keyword.ONBUILD) {
    throw new Error('Dockerfile diagnostic: ONBUILD is not permitted in the production image')
  }
  if (keyword === Keyword.COPY || keyword === Keyword.ADD) {
    validateCopyOrAdd(keyword, argumentsContent)
    validateCopyOrAddStage(instruction, keyword, currentStage, stageAliases)
    return
  }
  if (keyword === Keyword.ENV) {
    validateEnvironment(instruction)
    return
  }
  if (keyword === Keyword.HEALTHCHECK) {
    validateHealthcheck(instruction, argumentsContent)
    return
  }
  if ([Keyword.USER, Keyword.WORKDIR, Keyword.STOPSIGNAL].includes(keyword)) {
    requireOneArgument(keyword, argumentsContent)
    return
  }
  if (keyword === Keyword.EXPOSE) {
    const ports = instructionArguments(keyword, argumentsContent)
    const validPort = (port) => {
      const match = port.match(/^([^/]+)(?:\/(?:tcp|udp))?$/i)
      if (!match) return false
      if (/^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(match[1])) return true
      if (!/^\d{1,5}$/.test(match[1])) return false
      const numericPort = Number(match[1])
      return numericPort >= 1 && numericPort <= 65_535
    }
    if (ports.length === 0 || ports.some((port) => !validPort(port))) {
      throw new Error('Dockerfile diagnostic: EXPOSE requires valid port arguments')
    }
    return
  }
  if (keyword === Keyword.ARG) {
    const values = instructionArguments(keyword, argumentsContent)
    if (values.length !== 1 || !/^[A-Za-z_][A-Za-z0-9_]*(?:=[^\s]*)?$/.test(values[0])) {
      throw new Error('Dockerfile diagnostic: ARG requires one valid name and optional default')
    }
    return
  }
  if (keyword === Keyword.SHELL && !argumentsContent.startsWith('[')) {
    throw new Error('Dockerfile diagnostic: SHELL requires JSON form')
  }
  if ([Keyword.CMD, Keyword.ENTRYPOINT].includes(keyword) && !argumentsContent.startsWith('[')) {
    validateShellRun(argumentsContent)
  }
  if (keyword === Keyword.LABEL) {
    const properties = instruction.getProperties?.() ?? []
    if (properties.length === 0 || properties.some((property) => !property.getName() || property.getValue() === null)) {
      throw new Error('Dockerfile diagnostic: LABEL requires key and value assignments')
    }
  }
}

function validateAst(source) {
  const dockerfile = DockerfileParser.parse(source)
  if (hasDanglingEscape(source, dockerfile.getEscapeCharacter())) {
    throw new Error('Dockerfile diagnostic: dangling escape continuation at end of file')
  }
  const instructions = dockerfile.getInstructions()
  const stages = []
  const stageAliases = new Map()
  let declaredStage = 0
  for (const instruction of instructions) {
    if (instruction.getKeyword()?.toUpperCase() !== Keyword.FROM) continue
    const alias = instruction.getBuildStage()?.toLowerCase()
    if (alias) {
      if (stageAliases.has(alias)) throw new Error(`Dockerfile diagnostic: duplicate FROM stage alias: ${alias}`)
      stageAliases.set(alias, declaredStage)
    }
    declaredStage += 1
  }
  let currentStage = -1
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

    if (keyword === Keyword.FROM) {
      currentStage += 1
      const alias = instruction.getBuildStage()?.toLowerCase()
      stages.push({ from: instruction, alias, instructions: [] })
    } else if (currentStage < 0 && keyword !== Keyword.ARG) {
      throw new Error(`Dockerfile diagnostic: ${keyword} cannot appear before the first FROM`)
    } else if (currentStage >= 0) {
      stages[currentStage].instructions.push(instruction)
    }

    validateInstructionSemantics(instruction, keyword, argumentsContent, { currentStage, stageAliases })
  }
  if (stages.length === 0) throw new Error('Dockerfile diagnostic: Dockerfile requires a FROM instruction')
  return { dockerfile, stages }
}

function parseEnvironment(instructions) {
  const environment = new Map()
  for (const instruction of instructions) {
    if (instruction.getKeyword()?.toUpperCase() !== Keyword.ENV) continue
    for (const property of instruction.getProperties()) {
      environment.set(property.getName(), property.getValue())
    }
  }
  return environment
}

export async function verifyContainerConfiguration({ dockerfile, dockerignore } = {}) {
  const source = dockerfile ?? await readFile(resolve(repositoryRoot, 'Dockerfile'), 'utf8')
  const ignore = dockerignore ?? await readFile(resolve(repositoryRoot, '.dockerignore'), 'utf8')
  const { dockerfile: parsed, stages } = validateAst(source)
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

  const runtimeInstructions = stages[1].instructions
  const runtimeByKeyword = (keyword) => runtimeInstructions.filter((instruction) => instruction.getKeyword()?.toUpperCase() === keyword)
  const runtimeUsers = runtimeByKeyword(Keyword.USER)
  if (runtimeUsers.length === 0 || runtimeUsers.at(-1).getArgumentsContent()?.trim() !== 'node') {
    throw new Error('Runtime must execute as the non-root Node user')
  }
  const runtimeWorkdirs = runtimeByKeyword(Keyword.WORKDIR)
  if (runtimeWorkdirs.length === 0 || runtimeWorkdirs.at(-1).getArgumentsContent()?.trim() !== '/app') {
    throw new Error('Runtime must use /app as its working directory')
  }
  const runtimePorts = runtimeByKeyword(Keyword.EXPOSE)
    .flatMap((instruction) => instructionArguments(Keyword.EXPOSE, instruction.getArgumentsContent().trim()))
  if (!runtimePorts.includes('8080')) throw new Error('Runtime must expose port 8080')
  const runtimeCommands = runtimeByKeyword(Keyword.CMD)
  if (runtimeCommands.length !== 1) throw new Error('Runtime must define exactly one CMD')
  const runtimeHealthchecks = runtimeByKeyword(Keyword.HEALTHCHECK)
  if (runtimeHealthchecks.length !== 1) throw new Error('Runtime must define exactly one HEALTHCHECK')
  if (!runtimeHealthchecks[0].getArgumentsContent().includes('/healthz')) {
    throw new Error('Runtime HEALTHCHECK must request /healthz')
  }
  const runtimeStopSignals = runtimeByKeyword(Keyword.STOPSIGNAL)
  if (runtimeStopSignals.length === 0 || runtimeStopSignals.at(-1).getArgumentsContent()?.trim() !== 'SIGTERM') {
    throw new Error('Runtime must use SIGTERM for graceful shutdown')
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
  const command = runtimeCommands[0].getArgumentsContent() ?? ''
  if (/migrat/i.test(command)) throw new Error('Container startup must not run database migrations')
  if (command !== '["node", "server/start.js"]') throw new Error('Runtime must start the Fastify Node server directly')
  if (/nginx/i.test(source)) throw new Error('Nginx must not be present in the one-container runtime')

  if (/^(?:ARG|ENV)\s+[^\n]*(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY)/gmi.test(source)) {
    throw new Error('Container must not define secret-bearing build arguments or environment values')
  }

  const environment = parseEnvironment(runtimeInstructions)
  for (const [name, value] of environment) {
    if (/migrat/i.test(name) && /^(?:1|on|true|yes)$/i.test(value ?? '')) {
      throw new Error('Runtime must not enable migrations through environment configuration')
    }
  }
  if (environment.get('NODE_ENV') !== 'production') throw new Error('Runtime must set NODE_ENV=production')
  if (environment.get('SERVE_STATIC') !== 'true') throw new Error('Runtime must enable production static serving')
  if (environment.get('STATIC_ROOT') !== '/app/dist') throw new Error('Runtime must serve the copied /app/dist build')
  if (environment.get('PORT') !== '8080') throw new Error('Runtime must set PORT=8080')
  if (environment.get('RUN_MIGRATIONS') !== 'false') throw new Error('Runtime must keep migrations as an explicit release step')
  if (runtimeInstructions.at(-1)?.getKeyword()?.toUpperCase() !== Keyword.CMD) {
    throw new Error('Runtime CMD must be the final instruction with no later override')
  }

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
