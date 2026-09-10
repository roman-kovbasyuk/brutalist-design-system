import { useMemo, useState } from 'react'
import { AppButton } from '../atoms/AppButton.jsx'
import { FormField } from '../molecules/FormField.jsx'
import { componentGroups } from './component-groups.js'
import { basicGroups } from '../foundations/basics-catalog.js'
import { uiBlockCatalog } from './UIBlocks.jsx'
import './design-system-overview.css'

const updates = [
  { date: '10 Sep 2026', component: 'Data visualization', action: 'added', section: 'UI blocks', module: 'Charts' },
  { date: '9 Sep 2026', component: 'Dropdowns', action: 'updated in', section: 'Components', module: 'Inputs' },
  { date: '8 Sep 2026', component: 'Typography', action: 'updated in', section: 'Basics', module: 'Foundations' },
  { date: '5 Sep 2026', component: 'Legacy toast', action: 'deleted', section: 'Components', module: 'Feedback states' },
]

const sectionResults = [
  ...basicGroups.map((item) => ({ name: item.name, section: 'Basics', href: `/?section=basics#basics-${item.id}` })),
  ...componentGroups.map((item) => ({ name: item.name, section: 'Components', href: `/?section=components#${item.id}` })),
  ...uiBlockCatalog.map((item) => ({ name: item.name, section: item.group, href: `/?section=${['Charts', 'Metric widgets', 'Pie charts', 'Token burn'].includes(item.group) ? 'data-visualization' : 'ui-blocks'}#ds-${item.id}` })),
]

const counts = [
  { label: 'Basics assets', value: basicGroups.length, detail: 'Foundations and tokens' },
  { label: 'Components', value: componentGroups.length, detail: 'Reusable interaction patterns' },
  { label: 'UI blocks', value: uiBlockCatalog.length, detail: 'Composed interface examples' },
  { label: 'Changes last week', value: updates.length, detail: 'Added, updated, or deleted' },
]

export function DesignSystemOverview() {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return []
    return sectionResults.filter((item) => `${item.name} ${item.section}`.toLowerCase().includes(value)).slice(0, 8)
  }, [query])
  const groupedUpdates = updates.reduce((groups, update) => {
    groups[update.date] ??= []
    groups[update.date].push(update)
    return groups
  }, {})

  return <section className="ds-home" aria-labelledby="ds-home-title">
    <header className="ds-home__header">
      <span className="ds-home__eyebrow">Reference library</span>
      <h1 id="ds-home-title">Design system</h1>
      <p>Explore the latest foundations, components, and interface blocks.</p>
    </header>

    <div className="ds-home__stats" aria-label="Library totals">
      {counts.map((item) => <article className="ds-home__stat" key={item.label}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.detail}</small>
      </article>)}
    </div>

    <div className="ds-home__search" role="search">
      <FormField label="Search the design system" id="ds-home-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components, sections, or modules" autoComplete="off" />
      {query && <div className="ds-home__results" role="listbox" aria-label="Search results">
        {results.length ? results.map((item) => <a role="option" href={item.href} key={`${item.section}-${item.name}`} onClick={() => setQuery('')}><span>{item.name}</span><small>{item.section}</small></a>) : <p role="status">No matching sections or components.</p>}
      </div>}
    </div>

    <section className="ds-home__updates" aria-labelledby="ds-home-updates-title">
      <div className="ds-home__section-heading"><h2 id="ds-home-updates-title">Latest updates</h2><AppButton variant="quiet" size="compact" as="a" href="/?section=components">Browse components</AppButton></div>
      {Object.entries(groupedUpdates).map(([date, items]) => <div className="ds-home__update-group" key={date}>
        <h3>{date}</h3>
        {items.map((item) => <div className={`ds-home__update ds-home__update--${item.action.replaceAll(' ', '-')}`} key={`${date}-${item.component}`}><strong>{item.component}</strong><span>{item.action}</span><small>{item.section} · {item.module}</small></div>)}
      </div>)}
    </section>
  </section>
}
