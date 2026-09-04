import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Button } from './button.jsx'

describe('shadcn Button', () => {
  test('renders the repository-owned shadcn primitive', () => {
    render(<Button>New campaign</Button>)

    expect(screen.getByRole('button', { name: 'New campaign' })).toHaveAttribute('data-slot', 'button')
  })
})
