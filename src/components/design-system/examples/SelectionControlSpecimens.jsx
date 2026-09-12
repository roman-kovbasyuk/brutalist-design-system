import { useState } from 'react'
import { CheckboxField, RadioGroup, SwitchField } from '../components/forms/index.ts'
import { SpecimenCard } from './SpecimenCard.jsx'
import { SpecimenGrid } from './SpecimenGrid.jsx'
import { useSpecimenStates } from './SpecimenStates.jsx'

export function SelectionControlSpecimens() {
  const [format, setFormat] = useState('square')
  const [includeAnimated, setIncludeAnimated] = useState(false)
  const [isAutoSaveOn, setIsAutoSaveOn] = useState(true)
  const radio = useSpecimenStates({ disabled: { label: 'Disabled' }, error: { label: 'Error' }, instructions: { label: 'Helper text' }, counts: { label: 'Counts' } })
  const checklist = useSpecimenStates({ disabled: { label: 'Disabled' }, indeterminate: { label: 'Mixed' }, error: { label: 'Error' } })
  const toggles = useSpecimenStates({ disabled: { label: 'Disabled' }, instructions: { label: 'Helper text' } })

  return <>
    <SpecimenCard
      title="Radiobuttons"
      states={radio.options} copyValue={radio.reference('RadioGroup')}
      description="Choose one option from a mutually exclusive set."
    >
      <SpecimenGrid>
        <div data-component-reference={radio.reference(`RadioGroup value="${format}"`)}>
          <RadioGroup
            id="v2-export-format"
            name="v2-export-format"
            label="Export format"
            value={format}
            onChange={setFormat}
            disabled={radio.values.disabled}
            error={radio.values.error ? 'Choose a supported export format.' : undefined}
            instructions={radio.values.instructions ? 'Select one output proportion.' : undefined}
            options={[
              { value: 'square', label: 'Square', count: radio.values.counts ? 4 : undefined },
              { value: 'portrait', label: 'Portrait', count: radio.values.counts ? 2 : undefined },
            ]}
          />
        </div>
      </SpecimenGrid>
    </SpecimenCard>

    <SpecimenCard
      title="Checklist"
      states={checklist.options} copyValue={checklist.reference('CheckboxField')}
      description="Select any number of independent options."
    >
      <SpecimenGrid>
        <div className="ds-selection-control-stack" data-component-reference={checklist.reference(`CheckboxField checked={${includeAnimated}}`)}>
          <CheckboxField
            id="v2-include-animated"
            label="Include animated formats"
            checked={includeAnimated}
            disabled={checklist.values.disabled}
            indeterminate={checklist.values.indeterminate}
            error={checklist.values.error ? 'Confirm the output formats.' : undefined}
            onChange={(event) => { setIncludeAnimated(event.currentTarget.checked); checklist.set('indeterminate', false) }}
          />
          <div data-component-reference="CheckboxField disabled={true}">
            <CheckboxField id="v2-publish-immediately" label="Publish immediately" disabled />
          </div>
        </div>
      </SpecimenGrid>
    </SpecimenCard>

    <SpecimenCard
      title="Toggles"
      states={toggles.options} copyValue={toggles.reference('SwitchField')}
      description="Use switches for immediate on/off preferences."
    >
      <SpecimenGrid>
        <div data-component-reference={toggles.reference(`SwitchField checked={${isAutoSaveOn}}`)}>
          <SwitchField id="v2-autosave" label="Autosave changes" checked={isAutoSaveOn} onCheckedChange={setIsAutoSaveOn} disabled={toggles.values.disabled} instructions={toggles.values.instructions ? 'Save edits automatically.' : undefined} />
        </div>
      </SpecimenGrid>
    </SpecimenCard>
  </>
}
