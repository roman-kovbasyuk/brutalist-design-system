import { useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, LayoutTemplate, Search, Shapes, SlidersHorizontal } from 'lucide-react'
import { libraryCatalog } from './library-catalog.js'
import { previewId } from './PreviewMetadata.jsx'
import './library-index.css'

const categories = [
  { name: 'Basics', key: 'basics', levels: ['foundations', 'atoms'], icon: SlidersHorizontal },
  { name: 'Components', key: 'components', levels: ['molecules'], icon: Blocks },
  { name: 'UI blocks', key: 'ui-blocks', levels: ['organisms', 'templates', 'examples'], icon: LayoutTemplate },
]

function formatDisplayName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

export function LibraryIndex({ activeCategory = 'Basics', onCategoryChange, hideComponentTree = false, navigationItems = undefined, onQueryChange = undefined }) {
  const searchRef = useRef(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [active, setActive] = useState(() => window.location.hash)
  const filtered = useMemo(() => libraryCatalog.filter(entry =>
    `${entry.name} ${entry.purpose}`.toLowerCase().includes(query.trim().toLowerCase())), [query])

  function updateQuery(value) {
    setQuery(value)
    onQueryChange?.(value)
  }

  useEffect(() => { if (searchOpen) searchRef.current?.focus() }, [searchOpen])

  useEffect(() => {
    const syncHash = () => setActive(window.location.hash)
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        updateQuery('')
      }
    }
    const onPointerDown = (event) => {
      if (!onQueryChange && searchOpen && !event.target.closest?.('.ds-brand-row')) {
        setSearchOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [searchOpen])

  return <aside className="ds-library-sidebar" id="ds-library-sidebar" aria-labelledby="ds-index-heading">
    <div className={`ds-brand-row${searchOpen ? ' is-search-open' : ''}`}>
      <a className="ds-brand" href="/design-system">
        <Shapes size={24} strokeWidth={1.7} aria-hidden="true" />
        <span>Design System</span>
      </a>
      <button
        type="button"
        className="ds-search-trigger"
        aria-label="Search library"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen(true)}
      >
        <Search size={18} aria-hidden="true" />
      </button>
      <form className="ds-search" role="search" aria-hidden={!searchOpen} onSubmit={(event) => event.preventDefault()}>
        <label>
          <span className="ds-visually-hidden">Search components</span>
          <input ref={searchRef} id="ds-library-search" type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder={navigationItems ? 'Find a name or token' : 'Search components'} tabIndex={searchOpen ? 0 : -1} />
        </label>
      </form>
    </div>
    <div className="ds-library-index">
      <h2 id="ds-index-heading" className="ds-visually-hidden">Library</h2>
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
      {!hideComponentTree && activeCategory !== 'overview' && <>
        <nav className="ds-library-tree" aria-label="Library components">
          {navigationItems ? [...new Set(navigationItems.map(item => item.group).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(group => <div className="ds-tree-group" key={group}>
            <h3>{group}</h3>
            {navigationItems.filter(item => item.group === group).sort((a, b) => a.name.localeCompare(b.name)).map(item => <a key={item.id} href={item.href} className="ds-tree-item" aria-current={active === item.href ? 'location' : undefined} onClick={() => { updateQuery(''); setActive(item.href) }}>{item.name}</a>)}
          </div>) : categories.flatMap(group => (activeCategory === 'all' || activeCategory === group.name ? group.levels : [])
            .flatMap(level => filtered.filter(entry => entry.level === level))
          ).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
            const href = `#${previewId(entry.name)}`
            return <a key={entry.name} href={href} className="ds-tree-item"
              aria-current={active === href ? 'location' : undefined}
              onClick={() => setActive(href)}>{formatDisplayName(entry.name)}</a>
          })}
          {!categories.some(group => activeCategory === 'all' || activeCategory === group.name) && <p className="ds-index-empty">No matching items.</p>}
        </nav>
      </>}
    </div>
  </aside>
}
