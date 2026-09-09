import { icons, MoreHorizontal } from 'lucide-react'

export const iconComponents = { ...icons, MoreHorizontal }

export const basicGroups = [
  ['color', 'Color'], ['typography', 'Typography'], ['spacing', 'Spacing'],
  ['shape', 'Shape & sizing'], ['elevation', 'Elevation'], ['motion', 'Motion'],
  ['layout', 'Layout'], ['icons', 'Icons'],
].map(([id, name]) => ({ id, name }))

export const iconNames = ['Search', 'Plus', 'Check', 'X', 'ArrowLeft', 'ArrowRight', 'ChevronDown', 'ChevronRight', 'Copy', 'Download', 'Upload', 'Trash2', 'Pencil', 'Settings', 'Menu', 'MoreHorizontal', 'Eye', 'Info', 'CircleAlert', 'LoaderCircle', 'Image', 'File', 'Folder', 'ExternalLink']
export const layouts = ['Stack', 'Inline', 'Grid', 'Container', 'Divider', 'ScrollArea', 'Surface']

const labels = { canvas: 'Canvas', surface: 'Surface', ink: 'Ink', accent: 'Accent', success: 'Success', danger: 'Danger', muted: 'Muted · decorative only', 'text-secondary': 'Secondary text', radius: 'Standard corners', 'radius-large': 'Large corners', 'radius-pill': 'Pill', 'border-width': 'Structural border', 'shadow-small': 'Small', 'shadow-interactive': 'Interactive', 'shadow-floating': 'Floating', 'duration-fast': 'Feedback', 'duration-disclosure': 'Disclosure', ease: 'Easing', font: 'Font family' }
function groupFor(key) {
  if (/^space-/.test(key)) return 'spacing'
  if (/^(shadow-|z-)/.test(key)) return 'elevation'
  if (/^(duration-|ease$)/.test(key)) return 'motion'
  if (/^icon-/.test(key)) return 'icons'
  if (/^(radius|border-width|control-height)/.test(key)) return 'shape'
  if (/^(font$|text-(h\d|lead|body|small|page|display|section|component|meta)$|line-|weight-)/.test(key) || /^text-lead-/.test(key)) return 'typography'
  return 'color'
}

/** Values are read from the canonical stylesheet, never maintained as a second scale. */
export function createBasicsManifest(css) {
  const declarations = Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]))
  function resolve(value, depth = 0) {
    if (depth > 12) throw new Error('Circular token alias')
    return value.replace(/var\((--[\w-]+)\)/g, (_, key) => resolve(declarations[key] ?? key, depth + 1))
  }
  const tokens = Object.entries(declarations).filter(([id]) => id.startsWith('--v2-')).map(([id, value]) => {
    const key = id.slice(5)
    return { id, name: labels[key] ?? key.replaceAll('-', ' '), group: groupFor(key), value, resolved: resolve(value), source: 'src/components/design-system/basics/tokens.css' }
  })
  return {
    schemaVersion: 1,
    tokens,
    components: layouts.map(name => ({ id: name, name, group: 'layout', source: `src/components/design-system/basics/layout/${name}.tsx`, import: `import { ${name} } from 'brutalist-design-system'` })),
    icons: Object.keys(iconComponents).sort().map(name => ({ id: `lucide:${name}`, name, group: 'icons', import: `import { ${name} } from 'lucide-react'` })),
  }
}
