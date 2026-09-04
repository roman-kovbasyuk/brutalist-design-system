import { useEffect, useState } from 'react'

const requiredFields = ['product', 'audience', 'goal']

export function BriefStage({ campaign, pendingAction, onSave }) {
  const [brief, setBrief] = useState(campaign.brief)
  const isSaving = pendingAction === 'save_brief'
  const isComplete = requiredFields.every((field) => brief[field].trim())
  const resetsLaterWork = Boolean(campaign.selectedCopyId || campaign.selectedDirectionId || campaign.composition)

  useEffect(() => {
    setBrief(campaign.brief)
  }, [campaign.id, campaign.brief])

  function update(field, value) {
    setBrief((current) => ({ ...current, [field]: value }))
  }

  function submit(event) {
    event.preventDefault()
    if (isComplete && !isSaving) onSave(brief)
  }

  return (
    <section className="mvp-stage-section" aria-labelledby="brief-stage-title">
      <div className="mvp-section-heading">
        <div>
          <p className="mvp-eyebrow">Step 1</p>
          <h3 id="brief-stage-title">Campaign brief</h3>
        </div>
        <span className="mvp-section-state">3 required fields</span>
      </div>
      <p className="mvp-section-copy">Give the generator only the information that changes the creative decision.</p>

      {resetsLaterWork && (
        <p className="mvp-inline-warning" role="note">
          Saving changes resets selected copy, image ideas, and template work.
        </p>
      )}

      <form className="mvp-form" onSubmit={submit}>
        <div className="mvp-form-grid">
          <Field label="Product" value={brief.product} onChange={(value) => update('product', value)} required />
          <Field label="Audience" value={brief.audience} onChange={(value) => update('audience', value)} required />
          <Field label="Goal" value={brief.goal} onChange={(value) => update('goal', value)} required />
          <Field label="Offer" value={brief.offer} onChange={(value) => update('offer', value)} />
        </div>
        <label className="mvp-field">
          <span>Notes</span>
          <textarea value={brief.notes} onChange={(event) => update('notes', event.target.value)} rows="3" placeholder="Tone, restrictions, or useful context" />
        </label>
        <div className="mvp-actions">
          <button className="mvp-button mvp-button--primary" type="submit" disabled={!isComplete || isSaving}>
            {isSaving ? 'Saving…' : 'Save brief'}
          </button>
          {!isComplete && <span className="mvp-action-hint">Complete product, audience, and goal.</span>}
        </div>
      </form>
    </section>
  )
}

function Field({ label, value, onChange, required = false }) {
  return (
    <label className="mvp-field">
      <span>{label}{required && <i aria-hidden="true"> *</i>}</span>
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  )
}
