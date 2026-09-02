import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BannerPreview } from './BannerPreview.jsx'
import { TemplateCard } from './TemplateCard.jsx'
import { templates } from '../data/templates.js'

describe('BannerPreview', () => {
  test('uses fallback copy when campaign content is not available yet', () => {
    render(<BannerPreview template={templates[0]} content={null} />)

    expect(screen.getByText('Speak before you move')).toBeInTheDocument()
    expect(screen.getByText('Practical Norwegian for real conversations.')).toBeInTheDocument()
  })

  test('uses the authored story ratio for a story master', () => {
    const storyTemplate = templates.find((template) => template.masterRatio === 'story')
    render(<BannerPreview template={storyTemplate} />)

    expect(screen.getByRole('article')).toHaveStyle({ aspectRatio: '9 / 16' })
  })

  test('applies the resize reflow decision as a layout class', () => {
    render(<BannerPreview template={templates[0]} ratio="1200 / 628" resizeLayout="wide-reflow" />)

    expect(screen.getByRole('article')).toHaveClass('banner--format-wide-reflow')
  })

  test('keeps the authored 9:16 ratio in story template cards', () => {
    const storyTemplate = templates.find((template) => template.masterRatio === 'story')
    render(<TemplateCard template={storyTemplate} />)

    expect(screen.getByRole('article', { name: /Template preview/ })).toHaveStyle({ aspectRatio: '9 / 16' })
  })

  test('keeps motion transforms inside channel wrappers and exposes their replay state', () => {
    const { rerender } = render(
      <BannerPreview
        template={templates[0]}
        motionPreset={{ text: 'fade-up', image: 'soft-zoom', cta: 'pop-in' }}
        motionVersion={2}
      />,
    )

    const preview = screen.getByRole('article')
    expect(preview).toHaveAttribute('data-motion-version', '2')
    expect(preview.querySelector('.motion-media')).toHaveAttribute('data-motion-preset', 'soft-zoom')
    expect(preview.querySelector('.motion-copy')).toHaveAttribute('data-motion-preset', 'fade-up')
    expect(preview.querySelector('.motion-cta')).toHaveAttribute('data-motion-preset', 'pop-in')
    expect(preview.querySelector('.banner-media')).not.toHaveClass('motion-media--soft-zoom')
    expect(preview.querySelector('.banner-copy')).not.toHaveClass('motion-copy--fade-up')

    rerender(<BannerPreview template={templates[0]} motionPreset={{ text: 'type-reveal', image: 'pan-up', cta: 'pulse' }} motionVersion={3} />)
    expect(preview).toHaveAttribute('data-motion-version', '3')
    expect(preview.querySelector('.motion-copy')).toHaveClass('motion-copy--type-reveal')
    expect(preview.querySelector('.motion-media')).toHaveClass('motion-media--pan-up')
    expect(preview.querySelector('.motion-cta')).toHaveClass('motion-cta--pulse')
  })

  test('preserves the authored type-led copy distribution inside its motion wrapper', () => {
    const typeLedTemplate = templates.find((template) => template.layout === 'type-led')
    render(<BannerPreview template={typeLedTemplate} motionPreset={{ text: 'fade-up', image: 'soft-zoom', cta: 'pop-in' }} />)

    const preview = screen.getByRole('article')
    expect(preview).toHaveClass('banner--type-led')
    expect(preview.querySelector('.motion-copy')).toHaveClass('motion-copy--type-led-distribution')
  })
})
