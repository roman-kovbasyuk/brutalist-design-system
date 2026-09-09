import { AppButton } from '../../components/design-system/components/actions/AppButton'
import { CheckboxField, TextField } from '../../components/design-system/components/forms'
import { Combobox } from '../../components/design-system/components/selection'
import { Breadcrumbs, Tabs } from '../../components/design-system/components/navigation'
import { Dialog, Popover } from '../../components/design-system/components/overlays'
import { Alert, Progress } from '../../components/design-system/components/feedback'
import { Table } from '../../components/design-system/components/data'
import { FileDropzone } from '../../components/design-system/components/files'
import { AITaskStatus } from '../../components/design-system/components/ai'
import { ActionCard, SelectionTile } from '../../components/design-system/components/content'
import { SettingsForm } from '../../components/design-system/ui-blocks/settings/SettingsForm'
import { AppLayout } from '../../components/design-system/ui-blocks/app-layout/AppLayout'
import { ItemBrowser } from '../../components/design-system/ui-blocks/item-browser/ItemBrowser'
import { ItemDetail } from '../../components/design-system/ui-blocks/item-detail/ItemDetail'
import { AIWorkspace } from '../../components/design-system/ui-blocks/ai-workspace/AIWorkspace'
import type { ExampleProps } from './types'

const choices = [{ value: 'warm', label: 'Warm' }, { value: 'cool', label: 'Cool' }, { value: 'bold', label: 'Bold' }]
const rows = [{ id: 'poster', name: 'Launch poster', state: 'Ready' }, { id: 'banner', name: 'Web banner', state: 'Draft' }]

export function AppButtonPrimaryExample({ options }: ExampleProps) {
  const variant = ['primary', 'secondary', 'danger', 'quiet'].includes(String(options.variant)) ? String(options.variant) as 'primary' | 'secondary' | 'danger' | 'quiet' : 'primary'
  return <AppButton variant={variant}>Continue</AppButton>
}

export function TextFieldExample({ options }: ExampleProps) {
  return <TextField label="Project name" defaultValue="Summer launch" instructions="Visible to collaborators." error={options.invalid ? 'A name is required.' : undefined} />
}
export function ChoiceFieldsExample({ options, onDraftChange }: ExampleProps) {
  return <CheckboxField label="Send release notes" checked={Boolean(options.checked)} onChange={(event) => onDraftChange({ checked: event.currentTarget.checked })} />
}
export function ComboboxExample({ draft, onDraftChange }: ExampleProps) {
  const value = typeof draft.value === 'string' ? draft.value : null
  return <Combobox label="Visual direction" options={choices} value={value} onValueChange={(next) => onDraftChange({ value: next ?? '' })} clearable />
}
export function TabsExample({ options, onDraftChange }: ExampleProps) {
  const value = typeof options.tab === 'string' ? options.tab : 'preview'
  return <Tabs ariaLabel="Specimen view" items={[{ value: 'preview', label: 'Preview' }, { value: 'code', label: 'Code' }, { value: 'notes', label: 'Notes' }]} value={value} onValueChange={(tab) => onDraftChange({ tab })} />
}
export function BreadcrumbsExample() { return <Breadcrumbs items={[{ label: 'Library', href: '#library' }, { label: 'Campaigns', href: '#campaigns' }, { label: 'Summer launch' }]} /> }
export function DialogExample({ options, onDraftChange }: ExampleProps) {
  const open = Boolean(options.open)
  return <Dialog open={open} onOpenChange={(next) => onDraftChange({ open: next })} trigger={<AppButton size="compact">{open ? 'Dialog open' : 'Open dialog'}</AppButton>} title="Archive draft" description="This can be restored later."><p>Archive this draft from the active board?</p><AppButton size="compact" onClick={() => onDraftChange({ open: false })}>Archive</AppButton></Dialog>
}
export function PopoverExample({ options, onDraftChange }: ExampleProps) {
  return <Popover open={Boolean(options.open)} onOpenChange={(open) => onDraftChange({ open })} trigger={<AppButton size="compact" variant="secondary">More options</AppButton>}><p>Use this surface for short, contextual actions.</p></Popover>
}
export function AlertExample({ options }: ExampleProps) {
  const tone = ['info', 'success', 'warning', 'danger'].includes(String(options.tone)) ? String(options.tone) as 'info' | 'success' | 'warning' | 'danger' : 'info'
  return <Alert tone={tone} title="Draft saved">Your changes are ready to share.</Alert>
}
export function ProgressExample({ options }: ExampleProps) { return <Progress label="Uploading assets" value={typeof options.value === 'number' ? options.value : 60} /> }
export function TableExample() { return <Table label="Creative assets" rows={rows} getRowId={(row) => row.id} columns={[{ id: 'name', header: 'Name', cell: (row) => row.name }, { id: 'state', header: 'State', cell: (row) => row.state }]} /> }
export function FileDropzoneExample() { return <FileDropzone label="Add source files" description="PNG, JPG, or PDF up to your application limit." onFilesChange={() => undefined} /> }
export function AITaskStatusExample({ options }: ExampleProps) {
  const status = ['queued', 'running', 'succeeded', 'failed'].includes(String(options.state)) ? String(options.state) as 'queued' | 'running' | 'succeeded' | 'failed' : 'running'
  return <AITaskStatus status={status} label="Generate visual directions" progress={status === 'running' ? 60 : undefined} />
}
export function ActionCardExample() { return <ActionCard label="Brand direction" status={<span>Draft</span>} persistentAction={<AppButton size="compact">Open</AppButton>}><p>A compact surface for a focused piece of content.</p></ActionCard> }
export function SelectionTileExample({ options, onDraftChange }: ExampleProps) { return <SelectionTile label="Graphic poster" selected={Boolean(options.selected)} onChange={() => onDraftChange({ selected: !Boolean(options.selected) })} caption="Square format"><strong>Graphic poster</strong><span>High contrast, bold type.</span></SelectionTile> }
export function SettingsFormExample() { return <SettingsForm initialValue={{ name: 'Studio workspace', language: 'English', notifications: true }} onSave={async () => ({ ok: true })} /> }
export function AppLayoutExample() { return <AppLayout navigation={<nav><strong>Studio</strong><a href="#assets">Assets</a></nav>} header={<strong>Campaign library</strong>} inspector={<p>Inspector</p>}><p>Application content belongs in this slot.</p></AppLayout> }
export function ItemBrowserExample({ draft, onDraftChange }: ExampleProps) {
  const query = typeof draft.query === 'string' ? draft.query : ''
  return <ItemBrowser items={rows.map((row) => ({ id: row.id, title: row.name, status: row.state }))} total={2} query={query} onQueryChange={(next) => onDraftChange({ query: next })} page={1} pageCount={1} onPageChange={() => undefined} view="list" onViewChange={() => undefined} selectedIds={[]} onSelectionChange={() => undefined} onOpen={() => undefined} />
}
export function ItemDetailExample() { return <ItemDetail item={{ id: 'poster', revision: 'v3', title: 'Launch poster', description: 'A high-contrast campaign visual.' }} onSave={async () => ({ ok: true })} readOnly preview={<div>Preview area</div>} /> }
export function AIWorkspaceExample({ draft, onDraftChange }: ExampleProps) {
  const prompt = typeof draft.prompt === 'string' ? draft.prompt : 'Create three bold launch directions.'
  return <AIWorkspace prompt={prompt} onPromptChange={(next) => onDraftChange({ prompt: next })} state="ready" message="Directions are ready" result={<p>Three distinct concepts are available.</p>} onSubmit={() => undefined} onApply={() => undefined} />
}
