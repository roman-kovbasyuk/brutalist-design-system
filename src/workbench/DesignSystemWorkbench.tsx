import { useEffect, useMemo, useState } from 'react'
import { DesignSystemRoot } from '../components/design-system/basics/DesignSystemRoot'
import { LibraryIndex } from '../components/design-system/examples/LibraryIndex.jsx'
import { FamilyGallery } from './components/FamilyGallery'
import { entries } from './registry/entries'
import { families } from './registry/families'
import type { Family, Section } from './registry/types'
import { formatRoute, parseRoute } from './navigation/route'
import './workbench.css'
import { sitePath } from '../screens/site-path.js'

const sections: { id: Section; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'components', label: 'Components' },
  { id: 'ui-blocks', label: 'UI blocks' },
]

function sectionLabel(section: Section) {
  return sections.find((item) => item.id === section)?.label ?? 'Components'
}

export function DesignSystemWorkbench() {
  const initialRoute = parseRoute(new URL(window.location.href), families, entries)
  const [section, setSection] = useState<Section>(() => initialRoute.family ? initialRoute.section : 'components')
  const available = useMemo(() => families.filter((family) => family.section === section), [section])
  const [familyId, setFamilyId] = useState(() => initialRoute.family ?? 'buttons')
  const family: Family = available.find((item) => item.id === familyId) ?? available[0] ?? families[0]

  useEffect(() => {
    const syncRoute = () => {
      const route = parseRoute(new URL(window.location.href), families, entries)
      if (!route.family) return
      setSection(route.section)
      setFamilyId(route.family)
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  function updateRoute(nextSection: Section, nextFamily: string) {
    const url = formatRoute({ section: nextSection, family: nextFamily }, new URL(window.location.href))
    url.searchParams.set('mode', 'workbench')
    window.history.pushState({}, '', url)
  }

  function hrefFor(nextFamily: string) {
    const url = formatRoute({ section, family: nextFamily }, new URL(window.location.href))
    url.searchParams.set('mode', 'workbench')
    return `${url.pathname}${url.search}${url.hash}`
  }

  function chooseSection(next: Section) {
    if (next === 'basics') {
      window.location.assign(sitePath('/design-system?section=basics'))
      return
    }
    setSection(next)
    const nextFamily = families.find((item) => item.section === next)
    if (nextFamily) {
      setFamilyId(nextFamily.id)
      updateRoute(next, nextFamily.id)
    }
  }

  return <DesignSystemRoot className="ds-workbench ds-workspace">
    <LibraryIndex activeCategory={sectionLabel(section)} hideComponentTree onCategoryChange={(label: string) => {
      const next = sections.find((item) => item.label === label)
      if (next) chooseSection(next.id)
    }} />
    <main className="system-screen--v2 ds-catalog ds-workbench__main">
      <header className="v2-page-header">
        <div>
          <p className="v2-page-header__eyebrow">Design system v2</p>
          <h1>{family.title}</h1>
        </div>
        <p className="v2-page-header__intro">Browse related examples, then copy the component ID or token you need.</p>
      </header>
      <nav className="ds-library-tree ds-workbench__families" aria-label={`${sectionLabel(section)} families`}>
        {available.map((item) => <a key={item.id} className="ds-tree-item" href={hrefFor(item.id)} aria-current={family.id === item.id ? 'page' : undefined}
          onClick={(event) => {
            event.preventDefault()
            setFamilyId(item.id)
            updateRoute(section, item.id)
          }}>{item.title}</a>)}
      </nav>
      {entries.some((entry) => entry.familyId === family.id)
        ? <FamilyGallery family={family} entries={entries} />
        : <section className="ds-workbench__empty" aria-labelledby="empty-family"><h1 id="empty-family">{family.title}</h1><p>This family is mapped and ready for its first canonical examples.</p></section>}
    </main>
  </DesignSystemRoot>
}
