import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AppButton } from './atoms/AppButton.jsx'
import { AppButton as PublicButton } from './components/actions/AppButton'
import { InlineText } from './components/content/InlineText'
import { InlineText as LegacyInlineText } from './molecules/InlineText.jsx'
import { ActionCard } from './components/content/ActionCard'
import { ActionCard as LegacyActionCard } from './molecules/ActionCard.jsx'
import { SelectionTile } from './components/content/SelectionTile'
import { SelectionTile as LegacySelectionTile } from './molecules/SelectionTile.jsx'
import { TextAction } from './components/actions/TextAction'
import { TextAction as LegacyTextAction } from './atoms/TextAction.jsx'
import { FactGrid } from './molecules/FactGrid.jsx'

test('compatibility entries share the public component identities', () => {
  expect(LegacyInlineText).toBe(InlineText)
  expect(LegacyActionCard).toBe(ActionCard)
  expect(LegacySelectionTile).toBe(SelectionTile)
  expect(LegacyTextAction).toBe(TextAction)
})

test('legacy facts adapt content and headings to the public definition list', () => {
  render(<FactGrid label="Facts" items={[{ id: 'title', label: 'Title', content: 'Example', heading: true }]} />)
  expect(screen.getByRole('group', { name: 'Facts' })).toHaveClass('ds-fact-grid-container')
  expect(screen.getByRole('heading', { name: 'Example' })).toBeInTheDocument()
})

test('exiting action cards preserve inert semantics and supplied classes', () => {
  render(<LegacyActionCard label="Draft" exiting className="custom">Content</LegacyActionCard>)
  const article = screen.getByText('Content').closest('article')
  expect(article).toHaveAttribute('inert')
  expect(article).toHaveAttribute('aria-hidden', 'true')
  expect(article).toHaveClass('ds-action-card', 'custom')
})

test('catalog button imports resolve to the public implementation and block disabled links', () => {
  expect(AppButton).toBe(PublicButton)
  const onClick = vi.fn()
  render(<AppButton as="a" href="#destination" disabled onClick={onClick}>Open</AppButton>)
  const link = screen.getByRole('link', { name: 'Open' })
  expect(fireEvent.click(link)).toBe(false)
  expect(onClick).not.toHaveBeenCalled()
})

test('the public inline editor retains failed drafts and the captured source key', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn().mockResolvedValue({ ok: false, message: 'Source conflict' })
  const view = render(<InlineText label="Title" value="Original" sourceKey="v1" onSave={onSave} />)
  await user.click(screen.getByRole('button', { name: 'Edit title' }))
  await user.clear(screen.getByRole('textbox', { name: 'Title' }))
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Draft')
  view.rerender(<InlineText label="Title" value="Changed remotely" sourceKey="v2" onSave={onSave} />)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith('Draft', 'v1')
  expect(await screen.findByRole('alert')).toHaveTextContent('Source conflict')
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Edit title' })).toHaveTextContent('Changed remotely')
})
