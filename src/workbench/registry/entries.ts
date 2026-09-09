import { metadata } from './metadata'
import {
  ActionCardExample, AITaskStatusExample, AIWorkspaceExample, AlertExample, AppButtonPrimaryExample,
  AppLayoutExample, BreadcrumbsExample, ChoiceFieldsExample, ComboboxExample, DialogExample,
  FileDropzoneExample, ItemBrowserExample, ItemDetailExample, PopoverExample, ProgressExample,
  SelectionTileExample, SettingsFormExample, TableExample, TabsExample, TextFieldExample,
} from './renderers'
import type { Entry, Example } from './types'

const renderers: Record<string, Example['Component']> = {
  'app-button/primary': AppButtonPrimaryExample,
  'text-field/text-field-default': TextFieldExample,
  'choice-fields/choice-fields-default': ChoiceFieldsExample,
  'combobox/combobox-default': ComboboxExample,
  'tabs/tabs-default': TabsExample,
  'breadcrumbs/breadcrumbs-default': BreadcrumbsExample,
  'dialog/dialog-default': DialogExample,
  'popover/popover-default': PopoverExample,
  'alert/alert-default': AlertExample,
  'progress/progress-default': ProgressExample,
  'table/table-default': TableExample,
  'file-dropzone/file-dropzone-default': FileDropzoneExample,
  'ai-task-status/ai-task-status-default': AITaskStatusExample,
  'action-card/action-card-default': ActionCardExample,
  'selection-tile/selection-tile-default': SelectionTileExample,
  'settings-form/settings-form-default': SettingsFormExample,
  'app-layout/app-layout-default': AppLayoutExample,
  'item-browser/item-browser-default': ItemBrowserExample,
  'item-detail/item-detail-default': ItemDetailExample,
  'ai-workspace/ai-workspace-default': AIWorkspaceExample,
}

export const entries: Entry[] = metadata.map((entry) => ({
  ...entry,
  examples: entry.examples.map((example) => ({
    ...example,
    Component: renderers[`${entry.id}/${example.id}`],
  })),
}))
