import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppLayout } from './AppLayout'

describe('AppLayout', () => {
  it('keeps navigation, content, inspector and feedback as explicit slots', () => {
    render(<AppLayout navigation={<a href="#library">Library</a>} header={<h1>Workspace</h1>} inspector={<p>Details</p>} feedback={<p>Saved</p>}><p>Items</p></AppLayout>)

    expect(screen.getByRole('complementary', { name: 'Application navigation' })).toHaveTextContent('Library')
    expect(screen.getByRole('main')).toHaveTextContent('Items')
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveTextContent('Details')
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })
})
