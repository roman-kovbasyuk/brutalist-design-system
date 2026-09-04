import { useEffect, useMemo, useState } from 'react'

export function CopyStage({ campaign, pendingAction, onGenerate, onSelect, onEdit }) {
  const copySet = campaign.copySets.at(-1)
  const candidates = copySet?.candidates ?? []
  const selected = useMemo(
    () => campaign.copySets.flatMap((set) => set.candidates).find((candidate) => candidate.id === campaign.selectedCopyId) ?? null,
    [campaign.copySets, campaign.selectedCopyId],
  )
  const [editableCopy, setEditableCopy] = useState(selected)
  const busy = Boolean(pendingAction)

  useEffect(() => {
    setEditableCopy(selected)
  }, [selected])

  function update(field, value) {
    setEditableCopy((current) => ({ ...current, [field]: value }))
  }

  function submitEdit(event) {
    event.preventDefault()
    if (selected && editableCopy && !busy) {
      onEdit(selected.id, {
        headline: editableCopy.headline,
        body: editableCopy.body,
        offer: editableCopy.offer,
        cta: editableCopy.cta,
      })
    }
  }

  return (
    <section className="mvp-stage-section" aria-labelledby="copy-stage-title">
      <div className="mvp-section-heading">
        <div>
          <p className="mvp-eyebrow">Step 2</p>
          <h3 id="copy-stage-title">Copy options</h3>
        </div>
        <span className="mvp-section-state">3 options per generation</span>
      </div>
      <p className="mvp-section-copy">Choose the message before generating images. You can edit the selected option.</p>

      <div className="mvp-copy-toolbar">
        <button className="mvp-button" type="button" disabled={busy} onClick={onGenerate}>
          {pendingAction === 'generate_copy' ? 'Generating…' : 'Generate 3 copy options'}
        </button>
        {copySet && <span>Latest round · {candidates.length} options</span>}
      </div>

      {candidates.length > 0 && (
        <div className="mvp-copy-grid">
          {candidates.map((candidate, index) => {
            const isSelected = candidate.id === campaign.selectedCopyId
            return (
              <article className="mvp-copy-card" data-selected={isSelected ? 'true' : undefined} key={candidate.id}>
                <div className="mvp-copy-card__meta">
                  <span>Option {index + 1}</span>
                  {isSelected && <strong>Selected</strong>}
                </div>
                <h4>{candidate.headline}</h4>
                <p>{candidate.body}</p>
                <dl>
                  <div><dt>Offer</dt><dd>{candidate.offer || '—'}</dd></div>
                  <div><dt>CTA</dt><dd>{candidate.cta}</dd></div>
                </dl>
                {!isSelected && (
                  <button className="mvp-button mvp-button--small" type="button" disabled={busy} onClick={() => onSelect(candidate.id)}>
                    Use “{candidate.headline}”
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}

      {editableCopy && (
        <form className="mvp-copy-editor" onSubmit={submitEdit}>
          <div>
            <p className="mvp-eyebrow">Selected message</p>
            <h4>Edit copy</h4>
          </div>
          <label className="mvp-field mvp-field--wide">
            <span>Selected headline</span>
            <input value={editableCopy.headline} onChange={(event) => update('headline', event.target.value)} />
          </label>
          <label className="mvp-field mvp-field--wide">
            <span>Selected body</span>
            <textarea rows="3" value={editableCopy.body} onChange={(event) => update('body', event.target.value)} />
          </label>
          <div className="mvp-form-grid">
            <label className="mvp-field">
              <span>Selected offer</span>
              <input value={editableCopy.offer} onChange={(event) => update('offer', event.target.value)} />
            </label>
            <label className="mvp-field">
              <span>Selected CTA</span>
              <input value={editableCopy.cta} onChange={(event) => update('cta', event.target.value)} />
            </label>
          </div>
          <div className="mvp-actions">
            <button className="mvp-button mvp-button--primary" type="submit" disabled={busy || !editableCopy.headline.trim() || !editableCopy.cta.trim()}>
              {pendingAction === 'edit_copy' ? 'Saving…' : 'Save copy changes'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
