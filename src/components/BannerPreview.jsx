import { VisualArtwork } from './VisualArtwork.jsx'

const fallbackContent = {
  headline: 'Speak before you move',
  body: 'Practical Norwegian for real conversations.',
  offer: '15% off the intensive',
  cta: 'Start learning',
}

export function BannerPreview({ template, visual, content = fallbackContent, ratio, resizeLayout, compact = false }) {
  const currentTemplate = template ?? { layout: 'split-left', alignment: 'left', index: 1 }
  const effectiveRatio = ratio ?? (currentTemplate.masterRatio === 'story' ? '9 / 16' : '4 / 5')
  return (
    <article
      className={`banner banner--${currentTemplate.layout} banner--${currentTemplate.alignment} ${resizeLayout ? `banner--format-${resizeLayout}` : ''} ${compact ? 'banner--compact' : ''}`}
      style={{ aspectRatio: effectiveRatio }}
      aria-label={`Template preview ${currentTemplate.name ?? ''}`}
    >
      <div className="banner-media"><VisualArtwork visual={visual} compact /></div>
      <div className="banner-copy">
        <span className="banner-offer">{content.offer}</span>
        <h3>{content.headline}</h3>
        <p>{content.body}</p>
        <span className="banner-cta">{content.cta}</span>
      </div>
      <span className="banner-index">{String(currentTemplate.index ?? 1).padStart(2, '0')}</span>
    </article>
  )
}
