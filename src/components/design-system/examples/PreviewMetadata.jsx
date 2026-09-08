import { TokenChip } from '../atoms/TokenChip.jsx'
import { TokenCopyTarget } from '../atoms/TokenCopyTarget.jsx'
import { libraryCatalog } from './library-catalog.js'

export const previewId = name => `ds-preview-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`

export const cardEntries = {
  Buttons: 'AppButton',
  Fields: 'Native inputs and selection controls',
  'Input anatomy': 'Search, pickers and value controls',
  'Pickers and selection': 'SelectMenu',
  'Status language': 'StatusLabel and progress',
  'Workflow steps': 'WorkflowSteps',
  'Tabs and view controls': 'PillTabs + PillTabPanel',
  'Menu and supporting information': 'Overlays and feedback',
}
export const sectionEntries = { 1: 'Application tokens', 9: 'Catalog specimens', 11: 'PromptComposer' }

const tokens = {
  'Application tokens': ['--v2-canvas', '--v2-surface', '--v2-ink', '--v2-accent', '--v2-radius-large'],
  AppButton: ['--v2-accent', '--v2-control-height', '--v2-radius'],
  TokenChip: ['--v2-canvas', '--v2-control-height-compact', '--v2-radius-pill'],
  TokenCopyTarget: ['--v2-surface', '--v2-border', '--v2-control-height-compact'],
  'PillTabs + PillTabPanel': ['--v2-surface', '--v2-control-height-compact', '--v2-radius-pill'],
  SelectMenu: ['--v2-surface', '--v2-border', '--v2-control-height'],
  WorkflowSteps: ['--v2-accent', '--v2-text-secondary', '--v2-control-height-compact'],
  PromptComposer: ['--v2-surface', '--v2-border', '--v2-control-height'],
}

export function PreviewMetadata({ name, title, description, compact = false }) {
  const entry = libraryCatalog.find(item => item.name === name)
  if (!entry) return null
  return <header className="ds-preview-metadata" id={previewId(name)} tabIndex={-1}>
    {!compact && <h3><TokenCopyTarget copyValue={entry.name} label={`${entry.name} component ID`} inline>{title || entry.name}</TokenCopyTarget></h3>}
    <details className="ds-preview-reference">
      <summary>Reference<span className="ds-reference-name">: {entry.name}</span></summary>
      <div className="ds-preview-reference__body">
        <code>{entry.source}</code>
        {tokens[name] && <div className="ds-preview-tokens" aria-label={`${entry.name} tokens`}>
          {tokens[name].map(token => <TokenChip token={token} key={token} />)}
        </div>}
      </div>
    </details>
  </header>
}
