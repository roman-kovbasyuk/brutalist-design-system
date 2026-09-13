import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SidebarPanel } from '../../index'

it('exports a semantic sidebar with searchable projects and keyboard restoration', async () => {
  const user = userEvent.setup()
  render(<SidebarPanel brand={{ label: 'Studio' }} primaryAction={{ label: 'Create campaign' }}
    navigation={[{ id: 'home', label: 'Home', href: '/', current: true }]}
    projects={[{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }]} />)
  expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  await user.click(screen.getByRole('button', { name: 'Search campaigns' }))
  const input = screen.getByRole('searchbox')
  expect(input).toHaveFocus()
  await user.type(input, 'Alpha')
  expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Search campaigns' })).toHaveFocus()
  expect(screen.getByText('Beta')).toBeInTheDocument()
})

it('composes the shared menu and dispatches project actions', async () => {
  const user = userEvent.setup()
  const onProjectAction = vi.fn()
  render(<SidebarPanel brand={{ label: 'Studio' }} primaryAction={{ label: 'Create campaign' }} navigation={[]}
    projects={[{ id: 'a', title: 'Alpha', actions: [{ id: 'pin', label: 'Pin' }] }]} onProjectAction={onProjectAction} />)
  await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }))
  await user.click(screen.getByRole('menuitem', { name: 'Pin' }))
  expect(onProjectAction).toHaveBeenCalledWith('a', 'pin')
})
