import { useMemo, useState } from 'react'
import { AppButton } from '../atoms/AppButton.jsx'
import { TokenChip } from '../atoms/TokenChip.jsx'
import { PillTabPanel, PillTabs } from '../molecules/PillTabs.jsx'
import { libraryCatalog } from './library-catalog.js'
import './library-index.css'

const categories = [
  { name: 'Basics', levels: [{ id: 'foundations', label: 'Colors & type' }, { id: 'atoms', label: 'Controls' }] },
  { name: 'Components', levels: [{ id: 'molecules', label: 'Components' }] },
  { name: 'UI blocks', levels: [{ id: 'organisms', label: 'UI blocks' }, { id: 'templates', label: 'Pages' }, { id: 'examples', label: 'Examples' }] },
]

const tokenSets = {
  'Application tokens': ['--v2-canvas', '--v2-surface', '--v2-ink', '--v2-accent', '--v2-success', '--v2-danger', '--v2-radius-large'],
  AppButton: ['--v2-accent', '--v2-surface', '--v2-control-height', '--v2-radius'],
  TokenChip: ['--v2-canvas', '--v2-control-height-compact', '--v2-radius-pill'],
  TokenCopyTarget: ['--v2-surface', '--v2-border', '--v2-control-height-compact', '--v2-radius-large'],
  'PillTabs + PillTabPanel': ['--v2-accent', '--v2-surface', '--v2-control-height-compact', '--v2-radius-pill'],
  SelectMenu: ['--v2-surface', '--v2-border', '--v2-control-height', '--v2-radius'],
  WorkflowSteps: ['--v2-accent', '--v2-text-secondary', '--v2-control-height-compact'],
  PromptComposer: ['--v2-surface', '--v2-border', '--v2-control-height', '--v2-space-4'],
}

function tokensFor(entry) {
  return tokenSets[entry.name] || ['--v2-surface', '--v2-border', '--v2-space-4']
}

function entriesFor(levels, entries) {
  return levels.flatMap(level => entries.filter(entry => entry.level === level.id))
}

export function LibraryIndex() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Basics')
  const [selectedName, setSelectedName] = useState('Application tokens')
  const filtered = useMemo(() => libraryCatalog.filter(entry => Object.values(entry).join(' ').toLowerCase().includes(query.trim().toLowerCase())), [query])
  const activeCategory = categories.find(item => item.name === category) || categories[0]
  const activeEntries = entriesFor(activeCategory.levels, filtered)
  const selected = activeEntries.find(entry => entry.name === selectedName) || activeEntries[0] || null

  function chooseCategory(name) {
    setCategory(name)
    const next = entriesFor(categories.find(item => item.name === name).levels, filtered)[0]
    if (next) setSelectedName(next.name)
  }

  return <section className="ds-index" aria-labelledby="ds-index-heading">
    <div className="ds-index-heading">
      <div><h2 id="ds-index-heading">Library</h2><p>Choose a group, then select an item to see its role and tokens.</p></div>
      <label className="ds-index-search">Search library<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search components" /></label>
    </div>
    <PillTabs tabs={categories.map(item => item.name)} value={category} onChange={chooseCategory} ariaLabel="Library groups" idPrefix="ds-library" />
    <p className="ds-index-count" role="status">{filtered.length} items</p>
    {categories.map(group => {
      const groupEntries = entriesFor(group.levels, filtered)
      return <PillTabPanel key={group.name} tab={group.name} value={category} idPrefix="ds-library" className="ds-library-panel">
        <div className="ds-library-layout">
          <nav className="ds-library-tree" aria-label={`${group.name} tree`}>
            {group.levels.map(level => {
              const items = groupEntries.filter(entry => entry.level === level.id)
              if (!items.length) return null
              return <div className="ds-tree-group" key={level.id}>
                <h3>{level.label}</h3>
                <div className="ds-tree-items">
                  {items.map(entry => <AppButton key={entry.name} variant="quiet" size="compact"
                    className={`ds-tree-item ${selected?.name === entry.name ? 'ds-tree-item--selected' : ''}`.trim()}
                    aria-current={selected?.name === entry.name ? 'true' : undefined}
                    onClick={() => setSelectedName(entry.name)}>{entry.name}</AppButton>)}
                </div>
              </div>
            })}
            {!groupEntries.length && <p className="ds-index-empty">No matching items.</p>}
          </nav>
          {selected && <article className="ds-library-detail" aria-labelledby="ds-selected-heading">
            <div className="ds-library-detail__topline"><span>{selected.status}</span><small>{selected.source}</small></div>
            <h3 id="ds-selected-heading">{selected.name}</h3>
            <p className="ds-library-detail__purpose">{selected.purpose}</p>
            <div className="ds-library-detail__tokens">
              <h4>Tokens</h4>
              <div>{tokensFor(selected).map(token => <TokenChip token={token} key={token} />)}</div>
            </div>
            <dl>
              <div><dt>Usage</dt><dd>{selected.usage}</dd></div>
              <div><dt>States</dt><dd>{selected.states}</dd></div>
              <div><dt>Constraints</dt><dd>{selected.constraints}</dd></div>
            </dl>
            {selected.demo && <a className="ds-library-detail__link" href={`#v2-section-${selected.demo}`}>View example</a>}
          </article>}
        </div>
      </PillTabPanel>
    })}
  </section>
}
