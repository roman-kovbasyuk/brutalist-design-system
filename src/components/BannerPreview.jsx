import { VisualArtwork } from './VisualArtwork.jsx'

const fallbackContent = {
  headline: 'Заговорите до переезда',
  body: 'Практический норвежский для реальных разговоров.',
  offer: '−15% на интенсив',
  cta: 'Начать обучение',
}

export function BannerPreview({ template, visual, content = fallbackContent, ratio = '4 / 5', compact = false }) {
  const currentTemplate = template ?? { layout: 'split-left', alignment: 'left', index: 1 }
  return (
    <article
      className={`banner banner--${currentTemplate.layout} banner--${currentTemplate.alignment} ${compact ? 'banner--compact' : ''}`}
      style={{ aspectRatio: ratio }}
      aria-label={`Превью шаблона ${currentTemplate.name ?? ''}`}
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
