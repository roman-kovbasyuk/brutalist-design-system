import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { AnimatedBanner } from './AnimatedBanner.jsx'

describe('AnimatedBanner', () => {
  test('shows an accessible static thumbnail before the first playback', () => {
    const { rerender } = render(<AnimatedBanner playing={false} headline="Listen & discover" />)
    const canvas = screen.getByRole('img', { name: /Listen & discover/ })
    expect(canvas).toHaveAttribute('data-animated', 'false')
    expect(canvas.querySelector('image')).toHaveAttribute('href', expect.stringContaining('headphones.png'))
    rerender(<AnimatedBanner playing headline="Listen & discover" />)
    expect(canvas).toHaveAttribute('data-playing', 'true')
    expect(canvas).toHaveAttribute('data-animated', 'true')
    rerender(<AnimatedBanner playing={false} headline="Listen & discover" />)
    expect(canvas).toHaveAttribute('data-playing', 'false')
    expect(canvas).toHaveAttribute('data-animated', 'true')
  })
  test('uses manifest ratio geometry and safely renders text', () => {
    render(<AnimatedBanner templateId="bold-announcement" ratioId="story" headline={'<script>alert(1)</script>'} />)
    const canvas = screen.getByRole('img')
    expect(canvas).toHaveAttribute('viewBox', '0 0 1080 1920')
    expect(canvas.querySelector('script')).toBeNull()
    expect(canvas.querySelector('.studio-banner__text')).toHaveTextContent('<script>alert(1)</script>')
  })
})
