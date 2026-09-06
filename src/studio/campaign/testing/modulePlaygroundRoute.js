import { MODULE_IDS } from '../moduleContracts.js'

export const PLAYGROUND_SCENARIOS = Object.freeze([
  'draft', 'copy-ready', 'visuals-ready', 'composed', 'in-review',
  'changes-requested', 'ready', 'approved', 'delivered',
])

export function parseModulePlaygroundRoute(url) {
  const match = url.pathname.match(/^\/mvp\/dev\/modules(?:\/([^/]+))?\/?$/)
  if (!match) return null
  const moduleId = MODULE_IDS.includes(match[1]) ? match[1] : 'brief'
  const requestedScenario = url.searchParams.get('scenario')
  return { moduleId, scenario: PLAYGROUND_SCENARIOS.includes(requestedScenario) ? requestedScenario : 'draft' }
}

export function isModulePlaygroundRoute(url, enabled) {
  return Boolean(enabled && parseModulePlaygroundRoute(url))
}
