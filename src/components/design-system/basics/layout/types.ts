export type Space = 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16

export function spaceVariable(space: Space | undefined) {
  return `var(--v2-space-${space ?? 4})`
}
