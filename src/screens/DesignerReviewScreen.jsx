export function DesignerReviewScreen({ campaign, reviewStatus = 'in-review', onMarkReady }) {
  const readyForApproval = reviewStatus === 'ready-for-approval'

  return (
    <section className="designer-review-screen">
      <header className="designer-review-header">
        <div>
          <p className="page-context">Designer endpoint</p>
          <h1>Designer review</h1>
          <p>Reviewing <strong>{campaign.name}</strong> as Jordan Lee.</p>
        </div>
        <span className="designer-review-badge">Simulated review</span>
      </header>

      <section className="designer-review-card" aria-live="polite">
        <span className="campaign-status" data-status={readyForApproval ? 'ready-for-approval' : 'in-review'}>{readyForApproval ? 'Ready for approval' : 'In review'}</span>
        <h2>{readyForApproval ? 'Banners are ready for approval' : 'Review the prepared banner package'}</h2>
        <p>Figma review is simulated locally. No Figma file, notification, or external review service is connected.</p>
        <dl className="designer-review-details"><div><dt>Banners</dt><dd>{campaign.bannerCount}</dd></div><div><dt>Static visuals</dt><dd>{campaign.staticVisualCount}</dd></div><div><dt>Videos</dt><dd>{campaign.videoCount}</dd></div></dl>
        <button className="button button--primary" type="button" disabled={readyForApproval} onClick={onMarkReady}>Mark banners ready</button>
      </section>
    </section>
  )
}
