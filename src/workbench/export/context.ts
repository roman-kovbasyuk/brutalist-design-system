import type { Control, Entry, Example, Value, Values } from '../registry/types'

export type AgentContext = {
  version: string
  component: string
  example: string
  maturity: Entry['maturity']
  purpose: string
  imports: string[]
  dependencies: string[]
  tokens: string[]
  options: Values
  source: string
  usage: string
  keyboard: string
  constraints: string[]
}

function optionError(message: string): never {
  throw new Error(message)
}

function validateValue(control: Control, value: Value) {
  if (control.type === 'boolean' && typeof value !== 'boolean') {
    optionError(`Unsupported value ${JSON.stringify(value)} for option "${control.key}".`)
  }

  if (control.type === 'select' && (typeof value !== 'string' || !control.choices.includes(value))) {
    optionError(`Unsupported value ${JSON.stringify(value)} for option "${control.key}".`)
  }

  if (control.type === 'text' && (typeof value !== 'string' || value.length > control.maxLength)) {
    optionError(`Unsupported value ${JSON.stringify(value)} for option "${control.key}".`)
  }
}

function completeOptions(example: Example, options: Values): Values {
  const controls = new Map(example.controls.map((control) => [control.key, control]))

  for (const [key, value] of Object.entries(options)) {
    const control = controls.get(key)
    if (!control) optionError(`Unsupported option "${key}".`)
    validateValue(control, value)
  }

  const complete = { ...example.defaults, ...options }
  for (const control of example.controls) {
    const value = complete[control.key]
    if (value === undefined) optionError(`Missing required option "${control.key}".`)
    validateValue(control, value)
  }

  return complete
}

function assertPortable(entry: Entry) {
  if (entry.source.includes('src/studio')) {
    optionError(`Entry "${entry.id}" is not a portable design-system component.`)
  }
}

function buildContext(entry: Entry, example: Example, options: Values, version: string): AgentContext {
  assertPortable(entry)
  const resolvedOptions = completeOptions(example, options)

  return {
    version,
    component: entry.name,
    example: example.title,
    maturity: entry.maturity,
    purpose: entry.purpose,
    imports: entry.exports,
    dependencies: entry.dependencies,
    tokens: entry.tokens,
    options: resolvedOptions,
    source: example.getSource(resolvedOptions),
    usage: entry.usage,
    keyboard: entry.keyboard,
    constraints: entry.constraints,
  }
}

/** Produces JSON safe to copy into a coding-agent prompt or save alongside a recipe. */
export function exportContextJson(entry: Entry, example: Example, options: Values, version: string) {
  return JSON.stringify(buildContext(entry, example, options, version), null, 2)
}

/** Produces readable Markdown for a selected, supported design-system example. */
export function exportContext(entry: Entry, example: Example, options: Values, version: string) {
  const context = buildContext(entry, example, options, version)
  const list = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join('\n') : '- None'

  return `# ${context.component}: ${context.example}\n\nDesign system version: \`${context.version}\`\nMaturity: ${context.maturity}\n\n## Purpose\n${context.purpose}\n\n## Public imports\n\`\`\`tsx\nimport { ${context.imports.join(', ')} } from '@design-system'\n\`\`\`\n\n## Dependencies\n${list(context.dependencies)}\n\n## Tokens\n${list(context.tokens)}\n\n## Example source\n\`\`\`tsx\n${context.source}\n\`\`\`\n\n## Usage\n${context.usage}\n\n## Keyboard\n${context.keyboard}\n\n## Limits\n${list(context.constraints)}\n`
}
