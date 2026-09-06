// Browser-only selection identities. The server resolves and validates all content.
export const designIdentity = design => Object.fromEntries(
  ['templateId', 'templateVersion', 'copySetId', 'copyId', 'directionId'].map(key => [key, design[key]]),
)
export const designKey = design => JSON.stringify(Object.values(designIdentity(design)))
export const addDesigns = (selected, additions) => [...new Map(
  [...selected, ...additions].map(design => [designKey(design), designIdentity(design)]),
).values()]
export const toggleDesign = (selected, design) => selected.some(item => designKey(item) === designKey(design))
  ? selected.filter(item => designKey(item) !== designKey(design)) : [...selected, designIdentity(design)]

export function resolvePair(copyId, directionId, copies, directions) {
  const direction = directions.find(item => item.id === directionId)
  const linkedId = direction?.copy?.id
  const copy = copies.find(item => item.id === (linkedId || copyId))
  return copy && direction ? { copy, direction } : { copy: null, direction: null }
}

export function selectionFromComposition(composition, copies, directions) {
  if (!composition || composition.stale) return []
  if (composition.designs?.length) return composition.designs.map(designIdentity)
  // Legacy single layouts can be selected in the new module without mutating them.
  const copy = copies.find(item => item.headline === composition.slotValues.headline
    && item.body === composition.slotValues.body && item.cta === composition.slotValues.cta)
  const direction = directions.find(item => item.previewAssetId === composition.slotValues.image)
  return copy && direction ? [{ templateId: composition.templateId, templateVersion: composition.templateVersion,
    copySetId: copy.copySetId, copyId: copy.id, directionId: direction.id }] : []
}

export function availableFormats(formats, templates, designs, composition) {
  const selectedTemplates = designs.length ? designs.map(design => {
    const template = templates.find(template => template.id === design.templateId && template.version === design.templateVersion)
    if (template) return template
    // Older published versions remain valid on the server. Preserve only the
    // sizes already validated for this saved selection, never infer new support.
    const saved = composition && !composition.stale && (composition.designs?.length
      ? composition.designs.some(item => designKey(item) === designKey(design))
      : composition.templateId === design.templateId && composition.templateVersion === design.templateVersion)
    return saved ? { manifest: { ratios: composition.ratioIds.map(id => ({ id })) } } : null
  }) : templates
  return formats.filter(format => selectedTemplates.length > 0 && selectedTemplates.every(template =>
    template?.manifest.ratios.some(ratio => ratio.id === format.id)))
}

export const proportionOf = ratio => ratio.width === ratio.height ? 'Square' : ratio.width > ratio.height ? 'Horizontal' : 'Vertical'

export function previewRatioFor(template, proportion) {
  const preferred = { Square: 'square', Horizontal: 'landscape', Vertical: 'story' }[proportion]
  return template.manifest.ratios.find(ratio => ratio.id === preferred)
    ?? template.manifest.ratios.find(ratio => proportionOf(ratio) === proportion) ?? null
}
