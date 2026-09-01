import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BannerPreview } from './BannerPreview.jsx'
import { TemplateCard } from './TemplateCard.jsx'
import { templates } from '../data/templates.js'

describe('BannerPreview', () => {
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

    expect(screen.getByRole('article', { name: /Превью шаблона/ })).toHaveStyle({ aspectRatio: '9 / 16' })
  })
})
