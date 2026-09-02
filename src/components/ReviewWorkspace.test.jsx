import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ReviewWorkspace } from './ReviewWorkspace.jsx'

const banner = {
  id: 'banner-1',
  templateName: 'Split frame',
  dimensions: '1080×1350',
  platform: 'SMM Static',
  mediaType: 'static',
  motionPreset: { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in' },
  template: { id: 'split-frame', name: 'Split frame', format: 'vertical' },
  visual: { id: 'visual-1', title: 'Paper landscape' },
  content: { headline: 'Speak before you move', body: 'Practical Norwegian', cta: 'Start learning', offer: '15% off' },
}

describe('ReviewWorkspace', () => {
  test('formats motion presets as labeled readable values', () => {
    render(<ReviewWorkspace banners={[banner]} />)

    const motionSummary = screen.getByRole('list', { name: 'Motion presets for Split frame' })
    const items = within(motionSummary).getAllByRole('listitem')

    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Text')
    expect(items[0]).toHaveTextContent('Fade up')
    expect(items[1]).toHaveTextContent('Image')
    expect(items[1]).toHaveTextContent('Soft zoom')
    expect(items[2]).toHaveTextContent('CTA')
    expect(items[2]).toHaveTextContent('Pop in')
  })
})
