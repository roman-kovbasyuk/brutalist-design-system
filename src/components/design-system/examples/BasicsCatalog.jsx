import { useEffect, useState } from 'react'
import { TokenCopyTarget } from '../atoms/TokenCopyTarget.jsx'
import { FormField } from '../molecules/FormField.jsx'
import { SegmentedControl } from '../components/navigation/SegmentedControl.tsx'
import { Stack, Inline, Grid, Container, Divider, ScrollArea, Surface } from '../basics/layout'
import { basicGroups, createBasicsManifest, iconComponents as Icons, iconNames } from '../foundations/basics-catalog.js'
import tokenCss from '../basics/tokens.css?raw'
import './basics-catalog.css'

export const basicsManifest = createBasicsManifest(tokenCss)
const byId = Object.fromEntries(basicsManifest.tokens.map(token => [token.id, token]))
const palette = ['canvas', 'surface', 'ink', 'accent', 'success', 'danger', 'text-secondary', 'muted']
const typeKeys = ['h1', 'h2', 'h3', 'h4', 'h5', 'lead-large', 'lead-medium', 'body', 'small']
const layoutComponents = { Stack, Inline, Grid, Container, Divider, ScrollArea, Surface }
const iconSizeOptions = [
  { value: '--v2-icon-sm', label: '16' },
  { value: '--v2-icon-md', label: '20' },
  { value: '--v2-icon-lg', label: '24' },
  { value: '--v2-icon-xl', label: '32' },
  { value: '--v2-icon-xxl', label: '48' }
]
const normalizeIconQuery = value => value.toLowerCase().replace(/[\s:_-]+/g, '')
const matchesIcon = (item, query) => normalizeIconQuery(`${item.id} ${item.group}`).includes(normalizeIconQuery(query))

function matches(item, query) {
  return `${item.id} ${item.name} ${item.group} ${item.value ?? ''} ${item.resolved ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
}

function TokenReference({ token, children }) {
  return <TokenCopyTarget copyValue={token.id} label={token.id} className="ds-basic-reference">
    {children}
    <span className="ds-basic-reference__name">{token.name}</span>
    <code>{token.id}</code>
    <small>{token.resolved}</small>
  </TokenCopyTarget>
}

function Group({ id, name, children }) {
  return <section className="v2-foundation-group ds-basic-group" id={`basics-${id}`} aria-labelledby={`basics-${id}-title`}>
    <div className="v2-foundation-group__heading"><h2 id={`basics-${id}-title`}>{name}</h2></div>
    {children}
  </section>
}

export function BasicsCatalog({ query = '' }) {
  const [iconQuery, setIconQuery] = useState('')
  const [iconSize, setIconSize] = useState('--v2-icon-md')
  const tokens = basicsManifest.tokens.filter(token => matches(token, query))
  const components = basicsManifest.components.filter(item => matches(item, query))
  const icons = basicsManifest.icons.filter(item => matchesIcon(item, query))
  const iconResults = icons.filter(item => matchesIcon(item, iconQuery))
  const searchingIcons = Boolean(query.trim() || iconQuery.trim())
  const visibleIcons = searchingIcons ? iconResults.slice(0, 100) : iconNames.map(name => basicsManifest.icons.find(item => item.name === name))
  const normalized = query.trim().toLowerCase()

  useEffect(() => {
    const focusFamily = () => {
      const url = new URL(window.location.href)
      const target = url.hash.slice(1) || `basics-${url.searchParams.get('family')}`
      document.getElementById(target)?.scrollIntoView?.({ block: 'start' })
    }
    focusFamily()
    window.addEventListener('hashchange', focusFamily)
    return () => window.removeEventListener('hashchange', focusFamily)
  }, [])

  return <div className="ds-basics">
    <header className="ds-basics__intro"><h1>Basics</h1><p>Explore the foundations. Click a sample to copy its token or component ID.</p></header>
    {tokens.length + components.length + icons.length === 0 && <p role="status">No matches for “{query}”. Try a name, value, or token.</p>}
    {basicGroups.map(({ id, name }) => {
      const groupTokens = tokens.filter(token => token.group === id)
      if (!groupTokens.length && !(id === 'layout' && components.length) && !(id === 'icons' && icons.length)) return null
      if (id === 'color') {
        const swatches = groupTokens.filter(token => palette.includes(token.id.slice(5))).sort((a, b) => palette.indexOf(a.id.slice(5)) - palette.indexOf(b.id.slice(5)))
        const aliases = groupTokens.filter(token => !palette.includes(token.id.slice(5)))
        return <Group key={id} id={id} name={name}>
          <div className="v2-color-grid">{swatches.map(token => <TokenCopyTarget surface copyValue={token.id} label={token.id} className="v2-color-swatch" key={token.id}>
            <TokenCopyTarget copyValue={token.id} label={`${token.name} token`} className="v2-color-token-target">
              <span className="v2-color-swatch__sample" style={{ background: `var(${token.id})` }} aria-hidden="true" />
            </TokenCopyTarget>
            <TokenCopyTarget copyValue={token.id} label={`${token.name} name`} inline><strong>{token.name}</strong></TokenCopyTarget>
            <TokenCopyTarget copyValue={token.id} label={token.id} inline><code>{token.id}</code></TokenCopyTarget>
            <small>{token.resolved}</small>
          </TokenCopyTarget>)}</div>
          {normalized && aliases.length > 0 && <div className="ds-basic-aliases">{aliases.map(token => <TokenCopyTarget key={token.id} copyValue={token.id} label={token.id} className="ds-basic-alias"><code>{token.id}</code><small>{token.value}</small></TokenCopyTarget>)}</div>}
        </Group>
      }
      if (id === 'typography') {
        const roles = typeKeys.filter(key => !normalized || [byId[`--v2-text-${key}`], byId[`--v2-line-${key}`]].some(token => matches(token, query)) || 'typography'.includes(normalized))
        return <Group key={id} id={id} name={name}>
          <div className="v2-type-grid">{roles.map(key => {
            const size = byId[`--v2-text-${key}`].resolved
            const line = Math.round(parseFloat(size) * Number(byId[`--v2-line-${key}`].resolved))
            const weight = key === 'small' ? '--v2-weight-text' : '--v2-weight-heading'
            const recipe = `font: var(${weight}) var(--v2-text-${key}) / var(--v2-line-${key}) var(--v2-font);`
            return <TokenCopyTarget key={key} copyValue={recipe} label={`${key} typography`} className={`v2-type-sample v2-type-sample--${key}`}>
              <span className="v2-type-sample__name" style={{ font: `var(${weight}) var(--v2-text-${key}) / var(--v2-line-${key}) var(--v2-font)` }}>{({ 'lead-large': 'Lead 1', 'lead-medium': 'Lead 2', body: 'Body', small: 'Small' })[key] ?? key.toUpperCase()}</span><span className="v2-type-sample__copy" style={{ font: `var(${weight}) var(--v2-text-${key}) / var(--v2-line-${key}) var(--v2-font)` }}>Avenir</span><small className="v2-type-sample__value">{size} / {line}px · {byId[weight].resolved}</small>
            </TokenCopyTarget>
          })}</div>
          <div className="ds-basic-aliases">{groupTokens.filter(token => normalized || token.id === '--v2-font').map(token => <TokenCopyTarget key={token.id} copyValue={token.id} label={token.id} className="ds-basic-alias"><code>{token.id}</code><small>{token.resolved}</small></TokenCopyTarget>)}</div>
        </Group>
      }
      if (id === 'spacing') return <Group key={id} id={id} name={name}><div className="v2-spacing-grid">{groupTokens.map(token => <TokenCopyTarget key={token.id} copyValue={token.id} label={token.id} className="v2-spacing-step"><span className="v2-spacing-step__measure" style={{ '--v2-spacing-value': `var(${token.id})` }} aria-hidden="true" /><small>{token.resolved}</small><code>{token.id}</code></TokenCopyTarget>)}</div></Group>
      if (id === 'layout') return <Group key={id} id={id} name={name}><div className="ds-basic-grid">{components.map(item => {
        const Layout = layoutComponents[item.name]
        const children = item.name === 'Divider' ? undefined : [1, 2, 3].map(n => <span className="ds-basic-layout__item" key={n}>{n}</span>)
        return <TokenCopyTarget surface copyValue={item.id} label={item.id} key={item.id} className="ds-basic-layout-specimen">
          <div className="ds-basic-layout"><Layout {...(item.name === 'Grid' ? { minItemWidth: 48 } : {})} {...(item.name === 'ScrollArea' ? { label: 'Scrollable example', style: { maxHeight: 84 } } : {})}>{children}</Layout></div>
          <TokenCopyTarget copyValue={item.id} label={`${item.id} component ID`} className="ds-basic-reference"><span className="ds-basic-reference__name">{item.name}</span></TokenCopyTarget>
        </TokenCopyTarget>
      })}</div></Group>
      if (id === 'icons') return <Group key={id} id={id} name="Icons (Lucide Icons)">
        <div className="ds-basic-icon-searchbar"><div className="ds-basic-icon-search"><FormField label="Search icons" type="search" placeholder="Search all Lucide icons by name or ID" value={iconQuery} onChange={event => setIconQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setIconQuery('') }} /></div><SegmentedControl className="ds-basic-icon-size" ariaLabel="Icon size" options={iconSizeOptions} value={iconSize} onValueChange={setIconSize} /></div>
        {searchingIcons && <p className="ds-basic-note" role="status">{iconResults.length === 0 ? 'No icons found. Try another name.' : iconResults.length > 100 ? `${iconResults.length} icons found. Showing the first 100; refine your search to narrow the results.` : `${iconResults.length} icons found. Click to copy the icon ID.`}</p>}
        <div className="ds-basic-icons">{visibleIcons.map(item => { const Icon = Icons[item.name]; return <TokenCopyTarget key={item.id} copyValue={`${item.id}\n${iconSize}`} label={`${item.id} and ${iconSize}`} className="ds-basic-reference ds-basic-icon-tile"><Icon size={Number.parseFloat(byId[iconSize]?.resolved || '24px')} strokeWidth={1.8} aria-hidden="true" /></TokenCopyTarget> })}</div>
      </Group>
      return <Group key={id} id={id} name={name}>
        {id === 'motion' && <p className="ds-basic-note">Hover or focus a sample to preview. Reduced motion follows your device setting.</p>}
        <div className="ds-basic-grid">{groupTokens.filter(token => !token.id.startsWith('--v2-z-')).map(token => <TokenReference key={token.id} token={token}>
          <span className="ds-basic-demo" aria-hidden="true"><span className={`ds-basic-object${id === 'motion' ? ' ds-basic-object--motion' : ''}`} style={
            id === 'elevation' ? { boxShadow: token.id.includes('shadow') ? `var(${token.id})` : undefined } :
            id === 'motion' ? { transitionDuration: token.id.includes('duration') ? `var(${token.id})` : undefined, transitionTimingFunction: token.id === '--v2-ease' ? `var(${token.id})` : undefined } :
            token.id.includes('radius') ? { borderRadius: `var(${token.id})` } : token.id.includes('height') ? { height: `var(${token.id})` } : { borderWidth: `var(${token.id})` }
          }>{token.id.includes('-z-') ? token.resolved : 'Aa'}</span></span>
        </TokenReference>)}</div>
        {id === 'elevation' && <div className="ds-basic-aliases">{groupTokens.filter(token => token.id.startsWith('--v2-z-')).map(token => <TokenCopyTarget key={token.id} copyValue={token.id} label={token.id} className="ds-basic-alias"><code>{token.id}</code><small>Layer {token.resolved}</small></TokenCopyTarget>)}</div>}
      </Group>
    })}
  </div>
}
