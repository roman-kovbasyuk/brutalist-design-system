export const stages = ['Brief', 'Copy', 'AI assets', 'Banners', 'Review file', 'Figma review', 'Approval', 'Assets ready']
export const editableStatuses = new Set(['draft', 'copy_ready', 'direction_selected', 'composed'])
export function selectedCopy(workspace) {
  const set = workspace?.copies?.find((item) => item.id === workspace.campaign.selectedCopyId)
  return set?.candidates?.find((item) => item.id === set.selectedCandidateId) ?? null
}
export function currentStage(workspace) {
  if (!workspace) return 0
  const campaign = workspace.campaign
  if (campaign.status === 'delivered' || campaign.status === 'approved') return 7
  if (campaign.status === 'ready') return 6
  if (campaign.status === 'in_review') return 5
  if (campaign.status === 'changes_requested') return 5
  if (campaign.status === 'composed' && workspace.composition?.validation?.valid) return 4
  if (campaign.status === 'direction_selected' || campaign.status === 'composed') return 3
  if (campaign.selectedCopyId) return 2
  if (workspace.copies?.some((set) => !set.stale) || campaign.status === 'copy_ready') return 1
  return 0
}
export function canVisitStage(index, workspace) { return index <= currentStage(workspace) }
export function routeFromLocation(path, search = '') {
  if (/\/(?:templates)\/?$/.test(path)) return { view: 'templates' }
  if (/\/(?:system)\/?$/.test(path)) return { view: 'system' }
  const match = path.match(/\/(?:campaign|review|designer)\/([^/]+)/)
  if (match) {
    let id
    try { id = decodeURIComponent(match[1]) } catch { return { view: 'campaigns' } }
    const raw = new URLSearchParams(search).get('step')
    const step = raw !== null && /^[0-7]$/.test(raw) ? Number(raw) : null
    return { view: 'campaign', id, step }
  }
  return { view: 'campaigns' }
}
export const statusLabel = (status = '') => ({ copy_ready:'Copy ready', direction_selected:'Visual selected', composed:'Banners composed', in_review:'In design review', changes_requested:'Changes requested', ready:'Ready for approval', approved:'Approved', delivered:'Delivered', draft:'Draft' }[status] ?? status)
export const actionKey = () => crypto.randomUUID()
