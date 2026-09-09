import { AppButton, TabPanel, Tabs } from '../../components/design-system'
import type { Entry, Example, Values, View } from '../registry/types'
import { CodePanel } from './CodePanel'
import { DetailsLayout } from './DetailsLayout'
import { OptionsForm } from './OptionsForm'

export type ExampleDetailsProps = {
  entry: Entry
  example: Example
  options: Values
  draft: Values
  view: View
  onViewChange: (view: View) => void
  onOptionsChange: (patch: Values) => void
  onDraftChange: (patch: Values) => void
  onReset: () => void
}

export function ExampleDetails({ entry, example, options, draft, view, onViewChange, onOptionsChange, onDraftChange, onReset }: ExampleDetailsProps) {
  const idPrefix = `example-details-${entry.id}-${example.id}`
  const source = example.getSource({ ...options, ...draft })
  return <DetailsLayout>
    <header className="ds-example-details__header"><p>{entry.name}</p><h2>{example.title}</h2></header>
    <Tabs idPrefix={idPrefix} ariaLabel={`${example.title} details`} value={view} onValueChange={(value) => onViewChange(value as View)} items={[{ value: 'options', label: 'Options' }, { value: 'code', label: 'Code' }, { value: 'usage', label: 'How to use' }]} />
    <TabPanel idPrefix={idPrefix} value="options" activeValue={view}><OptionsForm controls={example.controls} options={options} draft={draft} onOptionsChange={onOptionsChange} onDraftChange={onDraftChange} /></TabPanel>
    <TabPanel idPrefix={idPrefix} value="code" activeValue={view}><CodePanel source={source} /></TabPanel>
    <TabPanel idPrefix={idPrefix} value="usage" activeValue={view}><p>{entry.usage}</p><p>{entry.keyboard}</p></TabPanel>
    <AppButton variant="quiet" size="compact" onClick={onReset}>Reset {example.title}</AppButton>
  </DetailsLayout>
}
