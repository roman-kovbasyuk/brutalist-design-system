import { useEffect, useMemo, useState } from 'react'
import { Blocks, LayoutTemplate, Search, Shapes, SlidersHorizontal } from 'lucide-react'
import { libraryCatalog } from './library-catalog.js'
import { previewId } from './PreviewMetadata.jsx'
import './library-index.css'

const categories = [
  { name: 'Basics', key: 'basics', levels: ['foundations', 'atoms'], icon: SlidersHorizontal },
  { name: 'Components', key: 'components', levels: ['molecules'], icon: Blocks },
  { name: 'UI blocks', key: 'ui-blocks', levels: ['organisms', 'templates', 'examples'], icon: LayoutTemplate },
]


export function LibraryIndex({ activeCategory = 'Basics', onCategoryChange }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(() => window.location.hash)
  const filtered = useMemo(() => libraryCatalog.filter(entry =>
    `${entry.name} ${entry.purpose}`.toLowerCase().includes(query.trim().toLowerCase())), [query])

  useEffect(() => {
    const syncHash = () => setActive(window.location.hash)
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  return <aside className="ds-library-sidebar" id="ds-library-sidebar" aria-labelledby="ds-index-heading">
    <div className="ds-brand-row">
      <a className="ds-brand" href="/mvp">
        <Shapes size={24} strokeWidth={1.7} aria-hidden="true" />
        <span>Design System</span>
      </a>
      <button
        type="button"
        className="ds-search-trigger"
        aria-label="Search library"
        onClick={() => document.getElementById('ds-library-search')?.focus()}
      >
        <Search size={18} aria-hidden="true" />
      </button>
    </div>
    <div className="ds-library-index">
      <h2 id="ds-index-heading" className="ds-visually-hidden">Library</h2>
      <div className="ds-index-search">
        <Search size={16} aria-hidden="true" />
        <input id="ds-library-search" aria-label="Search components" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search components" />
      </div>
      <nav className="ds-section-navigation" aria-label="Design system sections">
        {categories.map(({ name, key, icon: Icon }) => {
          const href = `/design-system?section=${key}`
          return <a
            key={name}
            href={href}
            aria-current={activeCategory === name ? 'page' : undefined}
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                event.preventDefault()
                onCategoryChange?.(name)
              }
            }}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{name}</span>
          </a>
        })}
      </nav>
      <nav className="ds-library-tree" aria-label="Library components">
        {categories.flatMap(group => (activeCategory === 'all' || activeCategory === group.name ? group.levels : [])
          .flatMap(level => filtered.filter(entry => entry.level === level))
        ).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
          const href = `#${previewId(entry.name)}`
          return <a key={entry.name} href={href} className="ds-tree-item"
            aria-current={active === href ? 'location' : undefined}
            onClick={() => setActive(href)}>{entry.name}</a>
        })}
        {!categories.some(group => activeCategory === 'all' || activeCategory === group.name) && <p className="ds-index-empty">No matching items.</p>}
      </nav>
    </div>
  </aside>
}
