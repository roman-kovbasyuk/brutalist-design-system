import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  Copy,
  FileUp,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react'
import { AdvancedControlSpecimens } from './AdvancedControlSpecimens.jsx'
import { AppButton } from '../atoms/AppButton.jsx'
import { WorkflowSteps } from '../molecules/WorkflowSteps.jsx'
import { SpecimenCard } from './SpecimenCard.jsx'
import { SpecimenSection } from './SpecimenSection.jsx'
import { PillTabs } from '../molecules/PillTabs.jsx'
import { SelectMenu } from '../molecules/SelectMenu.jsx'

function ButtonCell({ copyValue, copyLabel = copyValue, className = '', children }) {
  const [copied, setCopied] = useState(false)

  async function copyCellValue() {
    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={`v2-button-cell ${className}`.trim()}>
      {children}
      <button
        className="v2-button-cell__copy"
        type="button"
        aria-label={`Copy ${copyLabel}`}
        onClick={copyCellValue}
      >
        <Copy aria-hidden="true" size={14} />
      </button>
      <span className="v2-button-cell__feedback" role="status" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  )
}

export function ControlSpecimens() {
  const [isLoading, setIsLoading] = useState(true)
  const [includeAnimated, setIncludeAnimated] = useState(false)
  const [format, setFormat] = useState('square')
  const [isAutoSaveOn, setIsAutoSaveOn] = useState(true)
  const [objective, setObjective] = useState('')
  const [primaryChannel, setPrimaryChannel] = useState('Paid social')
  const [validationError, setValidationError] = useState('')

  function handleObjectiveChange(event) {
    setObjective(event.target.value)
    if (validationError) setValidationError('')
  }

  function handleValidation(event) {
    event.preventDefault()
    setValidationError(objective.trim() ? '' : 'Add a campaign objective')
  }

  return (
    <SpecimenSection
      index={2}
      title="Actions and controls"
      description="Buttons, form controls, and their complete state language."
      className="v2-section--unwrapped"
    >
      <SpecimenCard
        title="Buttons"
        description="Direct labels, unmistakable hierarchy, and physical interaction feedback."
      >
        <div className="v2-button-grid">
          <ButtonCell copyValue="Create campaign">
            <AppButton variant="primary">
              Create campaign
              <ArrowRight aria-hidden="true" size={18} />
            </AppButton>
          </ButtonCell>
          <ButtonCell copyValue="Review changes">
            <AppButton>Review changes</AppButton>
          </ButtonCell>
          <ButtonCell copyValue="Delete draft">
            <AppButton variant="danger">
              <Trash2 aria-hidden="true" size={18} />
              Delete draft
            </AppButton>
          </ButtonCell>
          <ButtonCell copyValue="More actions">
            <AppButton iconOnly aria-label="More actions">
              <MoreHorizontal aria-hidden="true" size={20} />
            </AppButton>
          </ButtonCell>
          <ButtonCell copyValue="Unavailable">
            <AppButton disabled>Unavailable</AppButton>
          </ButtonCell>
          <ButtonCell copyValue={isLoading ? 'Generating…' : 'Generate preview'}>
            <AppButton variant="primary" busy={isLoading}>
              {isLoading ? 'Generating…' : <><Play aria-hidden="true" size={18} />Generate preview</>}
            </AppButton>
          </ButtonCell>
          <ButtonCell copyValue={isLoading ? 'Show idle state' : 'Show loading state'}>
            <button
              className="v2-button v2-button--quiet"
              type="button"
              onClick={() => setIsLoading((current) => !current)}
            >
              {isLoading ? 'Show idle state' : 'Show loading state'}
            </button>
          </ButtonCell>
        </div>
      </SpecimenCard>

      <SpecimenCard
        title="Fields"
        description="Labels stay visible while helper and error text share a predictable position."
      >
        <form className="v2-control-form" onSubmit={handleValidation} noValidate>
          <div className="v2-field">
            <label htmlFor="v2-objective">Campaign objective</label>
            <input
              id="v2-objective"
              value={objective}
              onChange={handleObjectiveChange}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? 'v2-objective-error' : 'v2-objective-help'}
              placeholder="Increase free-trial starts"
            />
            {validationError ? (
              <p className="v2-field__error" id="v2-objective-error" role="alert">
                {validationError}
              </p>
            ) : (
              <p className="v2-field__help" id="v2-objective-help">
                State one measurable outcome for this campaign.
              </p>
            )}
          </div>

          <div className="v2-field">
            <label htmlFor="v2-channel">Primary channel</label>
            <SelectMenu
              label="Primary channel"
              value={primaryChannel}
              options={['Paid social', 'Email', 'Display']}
              onChange={setPrimaryChannel}
              triggerId="v2-channel"
            />
          </div>

          <div className="v2-field v2-field--wide">
            <label htmlFor="v2-notes">Creative notes</label>
            <textarea
              id="v2-notes"
              rows="4"
              placeholder="Add the tone, audience insight, and non-negotiables."
            />
          </div>

          <fieldset className="v2-choice-group">
            <legend>Export format</legend>
            <label>
              <input
                type="radio"
                name="v2-format"
                value="square"
                checked={format === 'square'}
                onChange={(event) => setFormat(event.target.value)}
              />
              <span>Square</span>
            </label>
            <label>
              <input
                type="radio"
                name="v2-format"
                value="portrait"
                checked={format === 'portrait'}
                onChange={(event) => setFormat(event.target.value)}
              />
              <span>Portrait</span>
            </label>
          </fieldset>

          <div className="v2-choice-stack">
            <label className="v2-check-control">
              <input
                type="checkbox"
                checked={includeAnimated}
                onChange={(event) => setIncludeAnimated(event.target.checked)}
              />
              <span>Include animated formats</span>
            </label>
            <div className="v2-switch-row">
              <span id="v2-autosave-label">Autosave changes</span>
              <button
                className="v2-switch"
                type="button"
                role="switch"
                aria-checked={isAutoSaveOn}
                aria-labelledby="v2-autosave-label"
                onClick={() => setIsAutoSaveOn((current) => !current)}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          </div>

          <label className="v2-file-drop">
            <FileUp aria-hidden="true" size={24} />
            <span><strong>Upload reference file</strong><small>PNG, JPG, or MP4 up to 25 MB</small></span>
            <input type="file" accept="image/png,image/jpeg,video/mp4" />
          </label>

          <div className="v2-disabled-fields" aria-label="Disabled control examples">
            <div className="v2-field">
              <label htmlFor="v2-owner">Campaign owner</label>
              <input id="v2-owner" value="Studio team" disabled readOnly />
            </div>
            <label className="v2-check-control">
              <input type="checkbox" disabled />
              <span>Publish immediately</span>
            </label>
          </div>

          <div className="v2-form-actions">
            <button className="v2-button v2-button--primary" type="submit">Validate brief</button>
          </div>
        </form>
      </SpecimenCard>

      <AdvancedControlSpecimens />
    </SpecimenSection>
  )
}

export function NavigationSpecimens() {
  const [selectedTab, setSelectedTab] = useState('preview')
  const [density, setDensity] = useState('comfortable')
  const [currentPage, setCurrentPage] = useState(2)
  const tabs = ['preview', 'code']

  return (
    <SpecimenSection
      index={3}
      title="Navigation"
      description="Patterns for moving through the product and within a workflow."
    >
      <div className="v2-navigation-grid">
        <SpecimenCard title="Sidebar row" description="Current location is explicit without relying on color alone.">
          <nav className="v2-sidebar-demo" aria-label="Sidebar specimen">
            <button type="button"><Circle aria-hidden="true" size={18} />Overview</button>
            <button type="button" aria-current="page"><Circle aria-hidden="true" size={18} />Campaigns<span>12</span></button>
            <button type="button"><Circle aria-hidden="true" size={18} />Assets<span>48</span></button>
          </nav>
        </SpecimenCard>

        <SpecimenCard title="Workflow steps" description="Connected stages show complete, current, and upcoming work.">
          <WorkflowSteps items={[
            { label: 'Brief', context: 'Complete', complete: true },
            { label: 'Copy', context: 'In progress', current: true },
            { label: 'Assets', context: 'Upcoming' },
          ]} />
        </SpecimenCard>
      </div>

      <SpecimenCard title="Tabs and view controls" description="Pills mark tabs; segmented controls remain structural and compact.">
        <div className="v2-navigation-controls">
          <div>
            <span className="v2-demo-label">Content view</span>
            <PillTabs tabs={tabs.map((tab) => tab[0].toUpperCase() + tab.slice(1))} value={selectedTab[0].toUpperCase() + selectedTab.slice(1)} onChange={(tab) => setSelectedTab(tab.toLowerCase())} ariaLabel="Content view" idPrefix="v2" />
            <div
              className="v2-tab-panel"
              id="v2-preview-panel"
              role="tabpanel"
              aria-labelledby="v2-preview-tab"
              tabIndex="0"
              hidden={selectedTab !== 'preview'}
            >
              A live rendering of the selected campaign asset.
            </div>
            <div
              className="v2-tab-panel"
              id="v2-code-panel"
              role="tabpanel"
              aria-labelledby="v2-code-tab"
              tabIndex="0"
              hidden={selectedTab !== 'code'}
            >
              Structured output for production handoff.
            </div>
          </div>

          <div>
            <span className="v2-demo-label">Layout density</span>
            <div className="v2-segmented-control" role="group" aria-label="Layout density">
              <button type="button" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}>Comfortable</button>
              <button type="button" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>Compact</button>
            </div>
          </div>
        </div>
      </SpecimenCard>

      <SpecimenCard title="Wayfinding" description="Breadcrumbs carry hierarchy while pagination keeps result movement local.">
        <div className="v2-wayfinding-grid">
          <nav className="v2-breadcrumbs" aria-label="Breadcrumb">
            <ol>
              <li><a href="#workspace" onClick={(event) => event.preventDefault()}>Workspace</a><ChevronRight aria-hidden="true" size={16} /></li>
              <li><a href="#campaigns" onClick={(event) => event.preventDefault()}>Campaigns</a><ChevronRight aria-hidden="true" size={16} /></li>
              <li aria-current="page">Nordic launch</li>
            </ol>
          </nav>

          <nav className="v2-pagination" aria-label="Pagination">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              <ArrowLeft aria-hidden="true" size={18} />
            </button>
            {[1, 2, 3].map((page) => (
              <button
                key={page}
                type="button"
                aria-label={`Page ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage === 3}
              onClick={() => setCurrentPage((page) => Math.min(3, page + 1))}
            >
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </nav>
        </div>
      </SpecimenCard>
    </SpecimenSection>
  )
}
