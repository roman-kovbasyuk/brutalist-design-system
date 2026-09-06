import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AnimatedBanner } from './AnimatedBanner.jsx'

it('previews the supplied published manifest instead of silently using a bundled sample template', () => {
  const manifest = { id: 'client-template', name: 'Client template', ratios: [{ id: 'custom', width: 400, height: 200 }], presentation: { backgroundColor: '#abcdef', shapes: [], slotColors: { headline: '#000000' } }, slots: [{ id: 'headline', type: 'text', required: true, fontSize: 20, fontWeight: 600, placements: { custom: { x: 20, y: 20, width: 360, height: 80 } } }] }
  render(<AnimatedBanner manifest={manifest} headline="Exact client content" body="" cta="" ratioId="custom" playing={false} />)
  expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 400 200')
  expect(screen.getByRole('img')).toHaveAccessibleName(/Client template: Exact client content/)
  expect(screen.getByText('Exact client content')).toBeInTheDocument()
})
