import { assertModuleId, MODULE_IDS } from './moduleContracts.js'

const legacyStepModules = ['brief', 'copy', 'visuals', 'banners', 'review', 'review', 'review', 'distribute']
const fromLegacy = value => /^[0-7]$/.test(value ?? '') ? legacyStepModules[Number(value)] : null

export function parseCampaignModule(search = '', hash = '') {
  const query = new URLSearchParams(search)
  const semantic = query.get('module')
  if (MODULE_IDS.includes(semantic)) return semantic
  const legacy = fromLegacy(query.get('step'))
  if (legacy) return legacy
  const anchor = hash.match(/^#campaign-module-([a-z]+)$/)?.[1]
  if (MODULE_IDS.includes(anchor)) return anchor
  return fromLegacy(hash.match(/^#campaign-step-([0-7])$/)?.[1])
}

export function campaignModuleUrl(campaignId, moduleId) {
  assertModuleId(moduleId)
  if (typeof campaignId !== 'string' || !campaignId.trim()) throw new TypeError('A campaign ID is required')
  return `/mvp/campaign/${encodeURIComponent(campaignId)}?module=${moduleId}#campaign-module-${moduleId}`
}
