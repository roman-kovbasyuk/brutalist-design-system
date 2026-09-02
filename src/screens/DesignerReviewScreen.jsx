import { useEffect, useState } from 'react'
import { ReviewWorkspace } from '../components/ReviewWorkspace.jsx'
import { readReview, subscribeToReview, writeReview } from '../domain/reviewStore.js'

export function DesignerReviewScreen({ campaign, campaignId }) {
  const [review, setReview] = useState(() => readReview(campaignId))
  const [reviewerName, setReviewerName] = useState('Jordan Lee')
  const hasSubmittedPackage = Boolean(review?.selectedBanners?.length)
  const isActiveReview = hasSubmittedPackage && review?.status === 'in-review'

  useEffect(() => {
    setReview(readReview(campaignId))
    return subscribeToReview(campaignId, setReview)
  }, [campaignId])

  function markReadyForApproval() {
    if (!review || review.status !== 'in-review') return
    writeReview(campaignId, {
      ...review,
      status: 'ready-for-approval',
      designerName: reviewerName.trim() || 'Jordan Lee',
      reviewedAt: new Date().toISOString(),
    })
  }

  return (
    <section className="designer-review-screen">
      <header className="designer-review-header">
        <div>
          <p className="page-context">Designer endpoint</p>
          <h1>Designer review</h1>
          <p>Reviewing <strong>{campaign.name}</strong> as the assigned designer.</p>
        </div>
        <span className="designer-review-badge">Local simulation</span>
      </header>

      {!hasSubmittedPackage ? (
        <section className="designer-review-card" aria-live="polite">
          <span className="campaign-status" data-status="draft">No package submitted</span>
          <h2>Nothing to review yet</h2>
          <p>No banner package has been submitted for review yet.</p>
          <label className="text-field" htmlFor="reviewer-name"><span>Reviewer name</span><input id="reviewer-name" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} /></label>
          <button className="button button--primary" type="button" disabled>Mark banners ready for approval</button>
        </section>
      ) : (
        <>
          <section className="designer-review-card" aria-live="polite">
            {isActiveReview ? (
              <>
                <span className="campaign-status" data-status="in-review">In review</span>
                <h2>Review the prepared banner package</h2>
                <p>Figma review is simulated locally. No Figma file, notification, or external review service is connected.</p>
                <a className="review-figma-link" href={review.figmaUrl} target="_blank" rel="noreferrer">Open Figma review</a>
                <label className="text-field" htmlFor="reviewer-name"><span>Reviewer name</span><input id="reviewer-name" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} /></label>
                <button className="button button--primary" type="button" onClick={markReadyForApproval}>Mark banners ready for approval</button>
              </>
            ) : review.status === 'draft' ? (
              <>
                <span className="campaign-status" data-status="draft">Draft</span>
                <h2>Package needs a new submission</h2>
                <p>A campaign change invalidated this package. Ask the marketer to prepare and submit an updated banner selection.</p>
              </>
            ) : review.status === 'ready-for-approval' ? (
              <>
                <span className="campaign-status" data-status="ready-for-approval">Ready for approval</span>
                <h2>Banners are ready for marketer approval</h2>
                <p>The designer review is recorded. The marketer can now confirm this locally simulated package.</p>
                <a className="review-figma-link" href={review.figmaUrl} target="_blank" rel="noreferrer">Open Figma review</a>
              </>
            ) : (
              <>
                <span className="campaign-status" data-status="approved">Approved</span>
                <h2>Package approved</h2>
                <p>The marketer approved this package. Review is complete and delivery is available to the campaign team.</p>
                <a className="review-figma-link" href={review.figmaUrl} target="_blank" rel="noreferrer">Open Figma review</a>
              </>
            )}
          </section>
          <ReviewWorkspace banners={review.selectedBanners} status={review.status} />
        </>
      )}
    </section>
  )
}
