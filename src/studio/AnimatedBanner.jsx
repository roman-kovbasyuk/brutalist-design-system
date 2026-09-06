import { useEffect, useId, useState } from 'react'
import { studioTemplates, studioTemplateSamples } from '../../shared/studioTemplates.js'
import sampleImage from './assets/headphones.png'
import './banner-templates.css'

export const studioSampleImage = sampleImage

// The canvas is also the export coordinate space: responsive scaling never changes composition.
// Expressive artwork is isolated from the application's operational motion and type tokens.
export function AnimatedBanner({
  templateId = 'editorial-split', manifest, headline, body, cta, tag = '', imageUrl = sampleImage,
  ratioId = 'square', playing = true, className = '', title, ...rest
}) {
  const template = manifest ?? studioTemplates.find((item) => item.id === templateId) ?? studioTemplates[0]
  const ratio = template.ratios.find((item) => item.id === ratioId) ?? template.ratios[0]
  const defaults = studioTemplateSamples[template.id] ?? { headline: '', body: '', cta: '' }
  const values = { headline: headline ?? defaults.headline, body: body ?? defaults.body, cta: cta ?? defaults.cta, tag }
  const titleId = useId()
  const [hasPlayed, setHasPlayed] = useState(playing)
  useEffect(() => { if (playing) setHasPlayed(true) }, [playing])
  return (
    <svg {...rest} className={`studio-banner studio-banner--${template.id} ${className}`}
      viewBox={`0 0 ${ratio.width} ${ratio.height}`} role="img" aria-labelledby={titleId}
      data-playing={playing} data-animated={hasPlayed} data-ratio={ratio.id}
      style={{ backgroundColor: template.presentation.backgroundColor, ...rest.style }}>
      <title id={titleId}>{title ?? `${template.name}: ${values.headline}. ${values.body} ${values.cta}${tag ? `. ${tag}` : ''}`}</title>
      <g aria-hidden="true">
        {template.presentation.shapes.map((shape, index) => {
          const p = shape.placements[ratio.id]
          const props = { fill: shape.fill, className: index === 1 ? 'studio-banner__geometry' : undefined }
          return shape.type === 'ellipse'
            ? <ellipse key={index} {...props} cx={p.x + p.width / 2} cy={p.y + p.height / 2} rx={p.width / 2} ry={p.height / 2} />
            : <rect key={index} {...props} {...p} />
        })}
        {template.slots.map((slot) => {
          const p = slot.placements[ratio.id]
          if (slot.type === 'image') {
            return imageUrl ? <image key={slot.id} className="studio-banner__image" {...p} href={imageUrl} preserveAspectRatio="xMidYMid slice" /> : null
          }
          if (!slot.required && !values[slot.id]?.trim()) return null
          return <foreignObject key={slot.id} {...p} className={`studio-banner__copy studio-banner__copy--${slot.id}`}>
            <div xmlns="http://www.w3.org/1999/xhtml" className="studio-banner__text"
              style={{ color: template.presentation.slotColors[slot.id], fontSize: slot.fontSize, fontWeight: slot.fontWeight, lineHeight: `${Math.ceil(slot.fontSize * 1.2)}px` }}>
              {values[slot.id]}
            </div>
          </foreignObject>
        })}
      </g>
    </svg>
  )
}

export default AnimatedBanner
