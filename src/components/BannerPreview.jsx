import { VisualArtwork } from './VisualArtwork.jsx'

const fallbackContent = {
  headline: 'Speak before you move',
  body: 'Practical Norwegian for real conversations.',
  offer: '15% off the intensive',
  cta: 'Start learning',
}

export function BannerPreview({ template, visual, content = fallbackContent, ratio, resizeLayout, compact = false, motionPreset, motionVersion = 0 }) {
  const currentTemplate = template ?? { layout: 'split-left', alignment: 'left', index: 1 }
  const currentContent = content ?? fallbackContent
  const effectiveRatio = ratio ?? (currentTemplate.masterRatio === 'story' ? '9 / 16' : '4 / 5')
  const motion = {
    text: motionPreset?.text ?? 'none',
    image: motionPreset?.image ?? 'none',
    cta: motionPreset?.cta ?? 'none',
  }
  return (
    <article
      className={`banner banner--${currentTemplate.layout} banner--${currentTemplate.alignment} ${resizeLayout ? `banner--format-${resizeLayout}` : ''} ${compact ? 'banner--compact' : ''} ${visual ? '' : 'banner--no-visual'}`}
      style={{ aspectRatio: effectiveRatio }}
      aria-label={`Template preview ${currentTemplate.name ?? ''}`}
      data-motion-version={motionVersion}
    >
      <div className="banner-media">
        <div className={`motion-media motion-media--${motion.image}`} data-motion-preset={motion.image} key={`media-${motion.image}-${motionVersion}`}>
          {visual ? <VisualArtwork visual={visual} compact /> : <div className="banner-media__placeholder" aria-hidden="true" />}
        </div>
      </div>
      <div className="banner-copy">
        <div className={`motion-copy motion-copy--${motion.text} ${currentTemplate.layout === 'type-led' ? 'motion-copy--type-led-distribution' : ''}`} data-motion-preset={motion.text} key={`copy-${motion.text}-${motionVersion}`}>
          <span className="banner-offer">{currentContent.offer}</span>
          <h3>{currentContent.headline}</h3>
          <p>{currentContent.body}</p>
          <span className={`motion-cta motion-cta--${motion.cta}`} data-motion-preset={motion.cta} key={`cta-${motion.cta}-${motionVersion}`}>
            <span className="banner-cta">{currentContent.cta}</span>
          </span>
        </div>
      </div>
      <span className="banner-index">{String(currentTemplate.index ?? 1).padStart(2, '0')}</span>
    </article>
  )
}
