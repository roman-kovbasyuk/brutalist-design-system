import { Video } from 'lucide-react'
import { BannerPreview } from './BannerPreview.jsx'

const defaultMotion = { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in' }
const motionLabels = {
  'fade-up': 'Fade up',
  'soft-zoom': 'Soft zoom',
  'pop-in': 'Pop in',
}

function MotionSummary({ bannerName, motion }) {
  return (
    <ul className="review-motion-summary" aria-label={`Motion presets for ${bannerName}`}>
      <li><span>Text</span><strong>{motionLabels[motion.text] ?? motion.text}</strong></li>
      <li><span>Image</span><strong>{motionLabels[motion.image] ?? motion.image}</strong></li>
      <li><span>CTA</span><strong>{motionLabels[motion.cta] ?? motion.cta}</strong></li>
    </ul>
  )
}

export function ReviewWorkspace({ banners = [], status = 'draft', figmaUrl = '' }) {
  return (
    <section className="review-workspace" aria-label="Review package" data-status={status}>
      <header className="review-workspace__header">
        <div>
          <p className="page-context">Local review package</p>
          <h2>Selected banners</h2>
        </div>
        <span>{banners.length} banner{banners.length === 1 ? '' : 's'}</span>
      </header>
      <div className="review-thumbnail-grid" aria-label="Selected banner thumbnails">
        {banners.map((banner) => {
          const motion = { ...defaultMotion, ...banner.motionPreset }
          return (
            <article className="review-thumbnail" data-testid="review-banner-thumbnail" key={banner.id}>
              <BannerPreview template={banner.template} visual={banner.visual} content={banner.content} compact motionPreset={motion} />
              <div className="review-thumbnail__meta">
                <strong>{banner.templateName}</strong>
                <span>{banner.dimensions} · {banner.platform}</span>
                {banner.mediaType === 'video' && <span className="review-video-badge"><Video size={14} aria-hidden="true" />Video</span>}
              </div>
            </article>
          )
        })}
      </div>
      <div className="review-table-wrap">
        <table className="review-table" aria-label="Selected banners for review">
          <thead><tr><th scope="col">Banner</th><th scope="col">Dimensions</th><th scope="col">Platform</th><th scope="col">Media type</th><th scope="col">Motion</th></tr></thead>
          <tbody>
            {banners.map((banner) => {
              const motion = { ...defaultMotion, ...banner.motionPreset }
              return <tr key={banner.id}><th scope="row">{banner.templateName}</th><td>{banner.dimensions}</td><td>{banner.platform}</td><td>{banner.mediaType === 'video' ? 'Video' : 'Static'}</td><td><MotionSummary bannerName={banner.templateName} motion={motion} /></td></tr>
            })}
          </tbody>
        </table>
      </div>
      {status !== 'draft' && figmaUrl && <a className="review-workspace__figma-link" href={figmaUrl} target="_blank" rel="noreferrer">Open Figma review</a>}
    </section>
  )
}
