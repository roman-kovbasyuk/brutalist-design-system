import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { makeScenario } from '../src/studio/campaign/testing/workspaceFixtures.js'

const names = ['draft', 'copy-ready', 'visuals-ready', 'composed', 'in-review', 'changes-requested', 'ready', 'approved', 'delivered']
const output = fileURLToPath(new URL('../src/studio/campaign/testing/modulePlaygroundFixtures.json', import.meta.url))
const fixtures = Object.fromEntries(names.map(name => [name, makeScenario(name)]))
await writeFile(output, `${JSON.stringify(fixtures, null, 2)}\n`)
