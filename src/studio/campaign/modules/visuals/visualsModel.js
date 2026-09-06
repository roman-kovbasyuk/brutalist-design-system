export const selectedCopies = input => (input.copies ?? []).filter(copy => copy.approved)
export const currentDirections = input => input.directions.filter(direction => !direction.stale)
export const missingStatic = input => currentDirections(input).filter(direction => !direction.previewAssetId
  && direction.status !== 'blocked' && !['pending', 'unknown', 'blocked'].includes(direction.generation?.status))

export function visualStatus(direction) {
  if (direction.previewAssetId) return 'ready'
  return direction.generation?.status ?? direction.status
}
