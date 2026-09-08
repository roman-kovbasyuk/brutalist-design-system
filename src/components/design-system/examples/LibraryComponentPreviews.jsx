import { SettingsPanel, SettingsRow, SettingsFooter } from '../organisms/SettingsPanel.jsx'
import { FormField } from '../molecules/FormField.jsx'
import { Switch } from '../atoms/Switch.jsx'
import { useState } from 'react'
import { AppButton } from '../atoms/AppButton.jsx'
import { TextAction } from '../atoms/TextAction.jsx'
import { UpdatedText } from '../atoms/UpdatedText.jsx'
import { TokenChip } from '../atoms/TokenChip.jsx'
import { TokenCopyTarget } from '../atoms/TokenCopyTarget.jsx'
import { SelectionTile } from '../molecules/SelectionTile.jsx'
import { InlineText } from '../molecules/InlineText.jsx'
import { FactGrid } from '../molecules/FactGrid.jsx'
import { AsyncStatus } from '../molecules/AsyncStatus.jsx'
import { MediaWorkflowCard } from '../organisms/MediaWorkflowCard.jsx'
import { PreviewMetadata, cardEntries, sectionEntries } from './PreviewMetadata.jsx'
import { libraryCatalog } from './library-catalog.js'
import { SpecimenSection } from './SpecimenSection.jsx'

export function LibraryComponentPreviews() {
  const [selected, setSelected] = useState(false)
  const [text, setText] = useState('Summer campaign')
  const [revision, setRevision] = useState(1)
  const [message, setMessage] = useState('')
  const examples = {
    SettingsPanel: <SettingsPanel title="Example preferences" description="Shared layout for personal settings." footer={<SettingsFooter message="Preview only" />}><SettingsRow label="Example updates" description="Choose whether to receive updates." compact><Switch label="Example updates" checked={selected} onChange={setSelected} /></SettingsRow></SettingsPanel>,
    FormField: <FormField label="Example profile name" value={text} onChange={event => setText(event.target.value)} hint="Visible labels and predictable help text." />,
    Switch: <Switch label="Example preference" checked={selected} onChange={setSelected} />,
    SelectionTile: <SelectionTile label="sample visual" selected={selected} onChange={() => setSelected(value => !value)} caption="Sample visual"><span>Campaign artwork</span></SelectionTile>,
    InlineText: <InlineText label="Example campaign name" value={text} sourceKey="example" onSave={value => setText(value)} />,
    FactGrid: <FactGrid label="Example campaign facts" items={[{ id: 'audience', label: 'Audience', content: 'New customers' }, { id: 'format', label: 'Format', content: 'Square' }]} />,
    AsyncStatus: <AsyncStatus>Preparing the preview…</AsyncStatus>,
    UpdatedText: <div className="v2-button-row"><UpdatedText identity="example" value={`Revision ${revision}`} /><AppButton size="compact" onClick={() => setRevision(value => value + 1)}>Update sample</AppButton></div>,
    TextAction: <><TextAction onClick={() => setMessage('Example action completed')}>Run example action</TextAction><p role="status">{message}</p></>,
    TokenChip: <TokenChip token="--v2-accent" />,
    TokenCopyTarget: <TokenCopyTarget copyValue="--v2-accent" label="example accent token"><span style={{ display: 'block', width: 160, height: 80, background: 'var(--v2-accent)' }} /></TokenCopyTarget>,
    MediaWorkflowCard: <MediaWorkflowCard title="Summer launch" columns={[{ id: 'prompt', label: 'Prompt', content: 'A bright summer campaign.' }, { id: 'visual', label: 'Static visual', content: 'Artwork preview' }, { id: 'video', label: 'Video', content: 'Video preview' }]} />,
  }
  const covered = [...Object.values(cardEntries), ...Object.values(sectionEntries)]
  const remaining = libraryCatalog.filter(entry => !covered.includes(entry.name))
  return <SpecimenSection index={12} title="Shared components and references" description="Individual component examples and implementation references.">
    {remaining.map(entry => <div className="v2-specimen-card" key={entry.name}>
      <PreviewMetadata name={entry.name} />
      {examples[entry.name] && <div className="v2-specimen-card__body">
        <div className="ds-component-preview">{examples[entry.name]}</div>
      </div>}
    </div>)}
  </SpecimenSection>
}
