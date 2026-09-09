import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DesignSystemWorkbench } from './DesignSystemWorkbench'

test('renders the grouped workbench with a section navigator and the button family', () => {
  render(<DesignSystemWorkbench />)
  expect(screen.getByRole('navigation', { name: 'Design system sections' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Buttons' })).toBeVisible()
})

test('opens a requested family from its query route', () => {
  history.replaceState({}, '', '/design-system?mode=workbench&section=components&family=inputs')
  render(<DesignSystemWorkbench />)
  expect(screen.getByRole('heading', { name: 'Inputs' })).toBeVisible()
})

test('follows browser history changes for an open workbench', () => {
  history.replaceState({}, '', '/design-system?mode=workbench&section=components&family=buttons')
  render(<DesignSystemWorkbench />)
  history.replaceState({}, '', '/design-system?mode=workbench&section=components&family=inputs')
  fireEvent.popState(window)
  expect(screen.getByRole('heading', { name: 'Inputs' })).toBeVisible()
})
