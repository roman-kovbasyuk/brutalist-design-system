import { ArrowUpRight } from 'lucide-react'
import { BannerPreview } from './BannerPreview.jsx'

export function TemplateCard({ template, selected = false, onChoose, mode = 'library' }) {
  return (
    <article className="template-card" data-selected={selected} data-testid={mode === 'library' ? 'template-card' : 'template-option'}>
      <button
        type="button"
        className="template-card-button"
        aria-label={`Select template ${template.name}`}
        aria-pressed={selected}
        onClick={() => onChoose?.(template.id)}
      >
        <BannerPreview template={template} compact />
        <span className="template-meta">
          <span>
            <strong>{template.name}</strong>
            <small>{template.family} · {template.masterRatio}</small>
          </span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </span>
      </button>
    </article>
  )
}
