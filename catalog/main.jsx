import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AppButton,
  AsyncStatus,
  PillTabPanel,
  PillTabs,
  PromptComposer,
  SelectMenu,
  SelectionTile,
  WorkflowSteps,
} from '../src/index.js'
import './catalog.css'

const tabs = ['Foundations', 'Components']
const statusOptions = ['Draft', 'In review', 'Ready', 'Published']

function Catalog() {
  const [tab, setTab] = useState('Foundations')
  const [status, setStatus] = useState('Draft')
  const [selected, setSelected] = useState(false)
  const [brief, setBrief] = useState('A concise campaign brief for a new launch.')
  return <main className="ds-root catalog">
    <header className="catalog-header">
      <div><p className="eyebrow">Banner Studio</p><h1>Design system</h1><p className="intro">Operational UI foundations for clear, confident creative workflows.</p></div>
      <AppButton variant="primary">Install guide</AppButton>
    </header>
    <PillTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Catalog sections" />
    <PillTabPanel tab="Foundations" value={tab}><section className="catalog-grid">
      <article className="panel"><p className="eyebrow">Color roles</p><div className="swatches"><span className="swatch canvas">Canvas<code>#f4f4f0</code></span><span className="swatch accent">Accent<code>#79d9ff</code></span><span className="swatch ink">Ink<code>#000000</code></span></div></article>
      <article className="panel"><p className="eyebrow">Typography</p><h2>Make the next action obvious.</h2><p className="muted">Avenir-family display with quiet, readable body copy.</p></article>
    </section></PillTabPanel>
    <PillTabPanel tab="Components" value={tab}><section className="catalog-grid">
      <article className="panel"><p className="eyebrow">Controls</p><div className="control-stack"><SelectMenu label="Campaign status" triggerLabel="Open campaign status options" value={status} options={statusOptions} onChange={setStatus} /><AppButton variant="secondary" busy={false}>Save changes</AppButton></div></article>
      <article className="panel"><p className="eyebrow">Selection</p><SelectionTile label="Choose this direction" selected={selected} onChange={setSelected}><strong>Editorial direction</strong><span>Clear type, direct action.</span></SelectionTile></article>
      <article className="panel"><p className="eyebrow">Workflow</p><WorkflowSteps items={[{ id: 'brief', label: 'Brief', status: 'complete' }, { id: 'copy', label: 'Copy', status: 'current' }, { id: 'review', label: 'Review', status: 'upcoming' }]} ariaLabel="Campaign workflow" /></article>
      <article className="panel"><p className="eyebrow">Composer</p><PromptComposer value={brief} onChange={setBrief} canSubmit={false} hint="Preview only" /><AsyncStatus>Ready for review</AsyncStatus></article>
    </section></PillTabPanel>
  </main>
}

createRoot(document.getElementById('root')).render(<StrictMode><Catalog /></StrictMode>)
