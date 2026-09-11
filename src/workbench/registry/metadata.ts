import type { EntryMetadata, Values } from './types'

const entry = (id: string, familyId: string, name: string, path: string, group: string, defaults: Values = {}, controls: EntryMetadata['examples'][number]['controls'] = []): EntryMetadata => ({
  id, familyId, name, purpose: `A portable ${name} specimen for application interfaces.`, maturity: 'beta', source: path,
  exports: [name], dependencies: [], tokens: ['--v2-accent', '--v2-control-height', '--v2-radius'],
  usage: `Use ${name} when this interaction or presentation is needed.`, keyboard: 'Uses native semantics and keyboard behavior.', constraints: ['Keep data and mutations owned by the application.'],
  examples: [{ id: `${id}-default`, title: `Default ${name}`, group, defaults, initialDraft: {}, controls }],
})

export const metadata: EntryMetadata[] = [
  {
    id: 'app-button', familyId: 'buttons', name: 'AppButton', purpose: 'Triggers an application action with the shared neobrutalist treatment.', maturity: 'beta',
    source: 'src/components/design-system/components/actions/AppButton.tsx', exports: ['AppButton'], dependencies: ['lucide-react'], tokens: ['--v2-accent', '--v2-control-height', '--v2-radius'],
    usage: 'Use for actions. Use an anchor for navigation.', keyboard: 'Enter and Space activate native buttons.', constraints: ['Icon-only buttons need an accessible name.', 'Busy prevents repeated activation.'],
    examples: [{ id: 'primary', title: 'Primary', group: 'Emphasis', defaults: { variant: 'primary' }, initialDraft: {}, controls: [{ key: 'variant', label: 'Variant', type: 'select', choices: ['primary', 'secondary', 'danger', 'quiet'], shareable: true }] }],
  },
  entry('text-field', 'inputs', 'TextField', 'src/components/design-system/components/forms/TextField.tsx', 'Text inputs', { invalid: false }, [{ key: 'invalid', label: 'Show error', type: 'boolean', shareable: true }]),
  entry('choice-fields', 'inputs', 'CheckboxField', 'src/components/design-system/components/forms/CheckboxField.tsx', 'Choices', { checked: true }, [{ key: 'checked', label: 'Checked', type: 'boolean', shareable: true }]),
  entry('combobox', 'selection', 'Combobox', 'src/components/design-system/components/selection/Combobox.tsx', 'Search and select'),
  entry('tabs', 'navigation', 'Tabs', 'src/components/design-system/components/navigation/Tabs.tsx', 'Views and progress', { tab: 'preview' }, [{ key: 'tab', label: 'Active tab', type: 'select', choices: ['preview', 'code', 'notes'], shareable: true }]),
  entry('breadcrumbs', 'navigation', 'Breadcrumbs', 'src/components/design-system/components/navigation/Breadcrumbs.tsx', 'Wayfinding'),
  entry('dialog', 'overlays', 'Dialog', 'src/components/design-system/components/overlays/overlays.tsx', 'Dialogs and drawers', { open: false }, [{ key: 'open', label: 'Open', type: 'boolean', shareable: false }]),
  entry('popover', 'overlays', 'Popover', 'src/components/design-system/components/overlays/overlays.tsx', 'Contextual help', { open: false }, [{ key: 'open', label: 'Open', type: 'boolean', shareable: false }]),
  entry('alert', 'feedback', 'Alert', 'src/components/design-system/components/feedback/Alert.tsx', 'Status', { tone: 'info' }, [{ key: 'tone', label: 'Tone', type: 'select', choices: ['info', 'success', 'warning', 'danger'], shareable: true }]),
  entry('progress', 'feedback', 'Progress', 'src/components/design-system/components/feedback/Progress.tsx', 'Loading and recovery', { value: 60 }),
  entry('table', 'data', 'Table', 'src/components/design-system/components/data/Table.tsx', 'Tables and filters'),
  entry('file-dropzone', 'files', 'FileDropzone', 'src/components/design-system/components/files/FileDropzone.tsx', 'Upload and file lists'),
  entry('ai-task-status', 'ai', 'AITaskStatus', 'src/components/design-system/components/ai/AITaskStatus.tsx', 'Task state and results', { state: 'running' }, [{ key: 'state', label: 'State', type: 'select', choices: ['queued', 'running', 'succeeded', 'failed'], shareable: true }]),
  entry('action-card', 'content', 'ActionCard', 'src/components/design-system/components/content/ActionCard.tsx', 'Cards and facts'),
  entry('selection-tile', 'content', 'SelectionTile', 'src/components/design-system/components/content/SelectionTile.tsx', 'Editing and choice', { selected: false }, [{ key: 'selected', label: 'Selected', type: 'boolean', shareable: true }]),
  entry('settings-form', 'settings', 'SettingsForm', 'src/components/design-system/ui-blocks/settings/SettingsForm.tsx', 'Settings form'),
  entry('app-layout', 'app-layout', 'AppLayout', 'src/components/design-system/ui-blocks/app-layout/AppLayout.tsx', 'Application frame'),
  entry('item-browser', 'item-browser', 'ItemBrowser', 'src/components/design-system/ui-blocks/item-browser/ItemBrowser.tsx', 'Browse and select'),
  entry('item-detail', 'item-detail', 'ItemDetail', 'src/components/design-system/ui-blocks/item-detail/ItemDetail.tsx', 'Detail and editing'),
  entry('ai-workspace', 'ai-workspace', 'AIWorkspace', 'src/components/design-system/ui-blocks/ai-workspace/AIWorkspace.tsx', 'Prompt and result'),
]
