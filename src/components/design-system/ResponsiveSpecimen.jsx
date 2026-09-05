import { useState } from 'react'

export function ResponsiveSpecimen() {
  const [compact, setCompact] = useState(false)
  const [saved, setSaved] = useState(false)

  return (
    <>
      <div className="v2-button-row">
        <button className="v2-button v2-button--secondary" type="button" aria-pressed={compact} aria-controls="v2-responsive-preview" onClick={() => setCompact((current) => !current)}>
          Preview compact layout
        </button>
        <span className="v2-field__help">Navigation wraps, cards stack, and tables scroll within the frame.</span>
      </div>
      <div className="v2-responsive-preview" id="v2-responsive-preview" data-compact={compact}>
        <div className="v2-responsive-workspace">
          <nav className="v2-responsive-nav" aria-label="Responsive workspace">
            <a href="#v2-responsive-campaign" aria-current="page">Campaign</a>
            <a href="#v2-responsive-assets">Assets</a>
            <a href="#v2-responsive-review">Review</a>
          </nav>
          <div className="v2-responsive-cards" id="v2-responsive-campaign">
            <article className="v2-foundation-card" id="v2-responsive-assets" aria-labelledby="v2-responsive-assets-title">
              <h3 id="v2-responsive-assets-title">Campaign assets</h3>
              <p>Three formats ready for review.</p>
            </article>
            <article className="v2-foundation-card" id="v2-responsive-review" aria-labelledby="v2-responsive-review-title">
              <h3 id="v2-responsive-review-title">Team review</h3>
              <p>Copy and visuals stay together.</p>
            </article>
          </div>
          <div className="v2-table-overflow" role="region" aria-label="Scrollable responsive campaign summary" tabIndex={0}>
            <table className="v2-data-table" aria-label="Responsive campaign summary">
              <thead><tr><th scope="col">Campaign</th><th scope="col">Formats</th><th scope="col">Status</th></tr></thead>
              <tbody><tr><th scope="row">Oslo launch</th><td>Portrait · Square · Landscape</td><td>Ready for review</td></tr></tbody>
            </table>
          </div>
          <div className="v2-responsive-actions">
            <button className="v2-button v2-button--primary" type="button" onClick={() => setSaved(true)}>Save responsive draft</button>
            <button className="v2-button v2-button--secondary" type="button" onClick={() => setSaved(false)}>Reset preview</button>
          </div>
          <p className="v2-field__help" role="status">{saved ? 'Draft saved in this preview.' : 'Changes stay local to this preview.'}</p>
        </div>
      </div>
    </>
  )
}
