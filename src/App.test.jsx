import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from './App.jsx'

vi.mock('./studio/StudioApp.jsx', () => ({StudioApp: () => <main>Connected campaign workspace</main>}))
test('application entry renders the connected studio', () => {
  render(<App/> )
  expect(screen.getByRole('main')).toHaveTextContent('Connected campaign workspace')
})
