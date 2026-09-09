import type { Entry, Family, Route, Section, View } from '../registry/types'

const sections: Section[] = ['basics', 'components', 'ui-blocks']
const views: View[] = ['options', 'code', 'usage']

const legacyAnchors: Record<string, Route> = {
  'ds-preview-appbutton': { section: 'components', family: 'buttons', example: 'primary' },
  'ds-typography': { section: 'basics', family: 'typography' },
}

function sectionFrom(value: string | null): Section {
  return sections.includes(value as Section) ? value as Section : 'basics'
}

function viewFrom(value: string | null): View | undefined {
  return views.includes(value as View) ? value as View : undefined
}

export function parseRoute(url: URL, families: Family[], entries: Entry[]): Route {
  const legacy = legacyAnchors[url.hash.slice(1)]
  if (legacy) return legacy

  const section = sectionFrom(url.searchParams.get('section'))
  const familyId = url.searchParams.get('family')
  const family = families.find((item) => item.id === familyId && item.section === section)
  if (!family) return { section }

  const route: Route = { section, family: family.id }
  const exampleId = url.searchParams.get('example')
  const exampleExists = entries.some((entry) => entry.familyId === family.id && entry.examples.some((example) => example.id === exampleId))
  if (!exampleExists) return route

  route.example = exampleId ?? undefined
  const view = viewFrom(url.searchParams.get('view'))
  if (view) route.view = view
  return route
}

export function formatRoute(route: Route, base: URL) {
  const url = new URL(base.pathname, base.origin)
  url.searchParams.set('section', route.section)
  if (route.family) url.searchParams.set('family', route.family)
  if (route.example) url.searchParams.set('example', route.example)
  if (route.view) url.searchParams.set('view', route.view)
  return url
}
