import {
  Bell,
  CircleAlert,
  CircleCheck,
  Clock3,
  Image,
  Inbox,
  LoaderCircle,
  Megaphone,
  MessageSquareText,
  Sparkles,
} from 'lucide-react'
import { SpecimenSection } from './SpecimenSection.jsx'

function SpecimenCard({ title, description, children }) {
  return (
    <div className="v2-specimen-card">
      <div className="v2-specimen-card__heading">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="v2-specimen-card__body">{children}</div>
    </div>
  )
}

function StatusLabel({ tone = 'neutral', icon: Icon, children }) {
  return (
    <span className={`v2-status-label v2-status-label--${tone}`}>
      {Icon ? <Icon aria-hidden="true" size={15} /> : <span aria-hidden="true" />}
      {children}
    </span>
  )
}

export function FeedbackSpecimens() {
  return (
    <SpecimenSection
      index={4}
      title="Feedback"
      description="Status, progress, errors, and system responses."
    >
      <SpecimenCard
        title="Status language"
        description="Every state pairs its color with a readable label and symbol."
      >
        <div className="v2-feedback-grid">
          <div>
            <span className="v2-demo-label">Campaign states</span>
            <ul className="v2-status-list" aria-label="Campaign status examples">
              <li><StatusLabel>Draft</StatusLabel></li>
              <li><StatusLabel tone="success" icon={CircleCheck}>Ready</StatusLabel></li>
              <li><StatusLabel tone="warning" icon={Clock3}>Review due</StatusLabel></li>
              <li><StatusLabel tone="danger" icon={CircleAlert}>Blocked</StatusLabel></li>
            </ul>
          </div>

          <div className="v2-processing-stack">
            <div className="v2-processing-status" role="status" aria-label="Campaign processing">
              <LoaderCircle aria-hidden="true" size={20} />
              <span><strong>Generating campaign</strong><small>Building 16 production assets</small></span>
            </div>
            <div
              className="v2-progress-track"
              role="progressbar"
              aria-label="Generation progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="64"
              aria-valuetext="64 percent complete"
            >
              <span style={{ width: '64%' }} />
            </div>
            <p className="v2-progress-caption"><span>Generation progress</span><strong>64%</strong></p>
          </div>
        </div>
      </SpecimenCard>

      <div className="v2-feedback-state-grid">
        <div className="v2-alert" role="alert">
          <CircleAlert aria-hidden="true" size={20} />
          <span><strong>Source copy needs attention</strong><small>Add a Norwegian CTA before export.</small></span>
        </div>

        <div className="v2-empty-state">
          <Inbox aria-hidden="true" size={24} />
          <span><strong>No approvals waiting</strong><small>Reviewed assets will appear here.</small></span>
        </div>

        <div className="v2-toast" role="status" aria-label="Campaign saved">
          <Bell aria-hidden="true" size={20} />
          <span><strong>Campaign saved</strong><small>Nordic spring launch · just now</small></span>
        </div>
      </div>
    </SpecimenSection>
  )
}

const campaigns = [
  { name: 'Nordic spring launch', stage: 'Assets', formats: '12', updated: '4 Sep, 14:32', status: 'Generating', tone: 'warning', icon: LoaderCircle },
  { name: 'Oslo commuter stories', stage: 'Review', formats: '8', updated: '4 Sep, 11:08', status: 'Review due', tone: 'warning', icon: Clock3 },
  { name: 'Weekend in Bergen', stage: 'Delivery', formats: '6', updated: '3 Sep, 16:45', status: 'Ready', tone: 'success', icon: CircleCheck },
]

export function DataSpecimens() {
  return (
    <SpecimenSection
      index={5}
      title="Data display"
      description="Structured information for scanning, comparing, and editing."
    >
      <div className="v2-metric-grid">
        <dl className="v2-metric-block">
          <dt>Active campaigns</dt>
          <dd className="v2-metric-block__value">12</dd>
          <dd className="v2-metric-block__meta">3 awaiting review</dd>
        </dl>
        <dl className="v2-metric-block">
          <dt>Assets generated</dt>
          <dd className="v2-metric-block__value">148</dd>
          <dd className="v2-metric-block__meta">+24 this week</dd>
        </dl>
        <dl className="v2-metric-block">
          <dt>Approval rate</dt>
          <dd className="v2-metric-block__value">92%</dd>
          <dd className="v2-metric-block__meta">First review pass</dd>
        </dl>
      </div>

      <SpecimenCard
        title="Campaign performance"
        description="Regular-weight values and bold labels keep dense information scannable."
      >
        <dl className="v2-summary-rows">
          <div><dt>Reporting window</dt><dd>29 Aug – 4 Sep</dd></div>
          <div><dt>Highest-output channel</dt><dd>Paid social · 72 assets</dd></div>
          <div><dt>Average review time</dt><dd>3h 18m</dd></div>
        </dl>

        <div className="v2-table-overflow" tabIndex="0" aria-label="Scrollable campaign performance table">
          <table className="v2-data-table" aria-label="Campaign performance">
            <thead>
              <tr>
                <th scope="col">Campaign</th>
                <th scope="col">Stage</th>
                <th scope="col">Formats</th>
                <th scope="col">Updated</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign, index) => {
                const StatusIcon = campaign.icon
                return (
                  <tr key={campaign.name}>
                    <th
                      scope="row"
                      contentEditable={index === 0}
                      suppressContentEditableWarning
                      aria-label={index === 0 ? 'Editable campaign name' : undefined}
                    >
                      {campaign.name}
                    </th>
                    <td>{campaign.stage}</td>
                    <td>{campaign.formats}</td>
                    <td>{campaign.updated}</td>
                    <td>
                      <StatusLabel tone={campaign.tone} icon={StatusIcon}>{campaign.status}</StatusLabel>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SpecimenCard>
    </SpecimenSection>
  )
}

const productionObjects = [
  {
    id: 'campaign-card',
    type: 'Campaign card',
    title: 'Nordic spring launch',
    detail: '12 formats · Paid social',
    status: 'Assets in progress',
    tone: 'warning',
    icon: Megaphone,
    statusIcon: LoaderCircle,
  },
  {
    id: 'prompt-card',
    type: 'Prompt card',
    title: 'Harbor morning, candid commuters',
    detail: 'Image prompt · Version 04',
    status: 'Prompt approved',
    tone: 'success',
    icon: MessageSquareText,
    statusIcon: CircleCheck,
  },
  {
    id: 'asset-tile',
    type: 'Asset tile',
    title: 'Oslo platform portrait',
    detail: '1080 × 1350 · JPG',
    status: 'Ready to place',
    tone: 'success',
    preview: 'asset',
    statusIcon: CircleCheck,
  },
  {
    id: 'banner-preview',
    type: 'Banner preview',
    title: 'Speak before you land',
    detail: '300 × 600 · Display',
    status: 'Copy fitted',
    tone: 'success',
    preview: 'banner',
    statusIcon: Sparkles,
  },
  {
    id: 'review-required',
    type: 'Review required',
    title: 'Weekend in Bergen · Story 03',
    detail: 'Norwegian copy · Reviewer queue',
    status: 'Review due today',
    tone: 'danger',
    icon: Image,
    statusIcon: CircleAlert,
  },
]

function ObjectPreview({ object }) {
  if (object.preview === 'asset') {
    return (
      <span className="v2-object-card__preview v2-object-card__preview--asset">
        <span className="v2-asset-thumbnail" role="img" aria-label="Generated asset thumbnail">
          <span className="v2-asset-thumbnail__label">Generated asset</span>
          <strong>OSLO / 07:42</strong>
          <span className="v2-asset-thumbnail__meta">1080 × 1350</span>
        </span>
      </span>
    )
  }

  if (object.preview === 'banner') {
    return (
      <span className="v2-object-card__preview v2-object-card__preview--banner">
        <span className="v2-banner-thumbnail" role="img" aria-label="Assembled banner thumbnail">
          <small>Norwegian in 10 minutes a day</small>
          <strong>Speak before you land.</strong>
          <span>Start learning</span>
        </span>
      </span>
    )
  }

  const ObjectIcon = object.icon
  return (
    <span className="v2-object-card__preview" aria-hidden="true">
      <ObjectIcon size={28} />
    </span>
  )
}

export function ContentObjectSpecimens() {
  return (
    <SpecimenSection
      index={6}
      title="Content objects"
      description="Production objects that carry creative work through the system."
    >
      <div className="v2-object-grid">
        {productionObjects.map((object) => {
          const labelId = `v2-object-${object.id}`
          return (
            <article className="v2-object-card" aria-labelledby={labelId} key={object.type}>
              <ObjectPreview object={object} />
              <span className="v2-object-card__content">
                <strong className="v2-object-card__type" id={labelId}>{object.type}</strong>
                <span className="v2-object-card__title">{object.title}</span>
                <small>{object.detail}</small>
                <StatusLabel tone={object.tone} icon={object.statusIcon}>{object.status}</StatusLabel>
              </span>
            </article>
          )
        })}
      </div>
    </SpecimenSection>
  )
}
