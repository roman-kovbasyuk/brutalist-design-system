import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ActionCard } from './ActionCard'
import { FactGrid } from './FactGrid'
import { InlineText } from './InlineText'
import { Panel } from './Panel'
import { SelectionTile } from './SelectionTile'
import { Tag } from './Tag'
import { TagButton } from './TagButton'

const contentStyles = readFileSync(join(import.meta.dirname, 'content.css'), 'utf8')

describe('portable content components', () => {
  it('provides a neutral panel with a header, subheader, and content slot', () => {
    render(<Panel title="Campaign details" description="Review the current configuration."><p>Content</p></Panel>)

    expect(screen.getByRole('region', { name: 'Campaign details' })).toHaveTextContent('Review the current configuration.')
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('uses the large radius and interactive elevation treatment', () => {
    expect(contentStyles).toContain('border-radius: var(--v2-radius-large)')
    expect(contentStyles).toContain('.ds-panel:hover { box-shadow: var(--v2-shadow-interactive); transform: translate(-4px, -4px); }')
    expect(contentStyles).toContain('padding: var(--v2-space-8)')
    expect(contentStyles).toContain('var(--v2-text-h4) / var(--v2-line-h4)')
    expect(contentStyles).toContain('font: var(--v2-weight-heading) var(--v2-text-h4)')
  })

  it('omits the header divider when no content slot is provided', () => {
    const { container } = render(<Panel title="Campaign brief" description="Optional context" />)
    expect(container.querySelector('.ds-panel')).toHaveClass('ds-panel--empty')
  })

  it('keeps ActionCard content semantic while exposing supplied actions', () => {
    render(<ActionCard label="Draft" actions={<button>Open</button>}><h3>Campaign brief</h3></ActionCard>)

    expect(screen.getByRole('article', { name: 'Draft' })).toHaveTextContent('Campaign brief')
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('renders FactGrid values as a labelled definition list', () => {
    render(<FactGrid label="Project details" items={[{ id: 'owner', label: 'Owner', value: 'Ari' }]} />)

    expect(screen.getByRole('group', { name: 'Project details' })).toHaveTextContent('Owner')
    expect(screen.getByText('Ari')).toBeInTheDocument()
  })

  it('renders Tags with explicit visual and semantic variants', () => {
    render(<>
      <Tag variant="filled" tone="accent">Paid social</Tag>
      <Tag variant="outline" tone="neutral">Draft</Tag>
      <Tag variant="filled" tone="success">Ready</Tag>
    </>)

    expect(screen.getByText('Paid social')).toHaveClass('ds-tag', 'ds-tag--filled', 'ds-tag--accent')
    expect(screen.getByText('Draft')).toHaveClass('ds-tag', 'ds-tag--outline', 'ds-tag--neutral')
    expect(screen.getByText('Ready')).toHaveAttribute('data-tone', 'success')
    expect(screen.getByText('Paid social').tagName).toBe('SPAN')
  })

  it('uses the accent color for accent and warning outline tags', () => {
    const normalizedStyles = contentStyles.replace(/\s+/g, ' ')
    expect(normalizedStyles).toContain(
      '.ds-tag--outline.ds-tag--accent, .ds-tag--outline.ds-tag--info, .ds-tag--outline.ds-tag--warning { border-color: var(--v2-accent); color: var(--v2-accent); }',
    )
  })

  it('composes an interactive tag control without changing Tag semantics', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<TagButton tone="accent" aria-label="Remove Paid social" onClick={onClick}>Paid social ×</TagButton>)

    const control = screen.getByRole('button', { name: 'Remove Paid social' })
    expect(control).toHaveClass('ds-tag', 'ds-tag-button', 'ds-tag--filled', 'ds-tag--accent')
    await user.click(control)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('adds an animated dismiss affordance for filter tags', () => {
    render(<TagButton dismissible tone="accent" aria-label="Remove Paid social">Paid social</TagButton>)

    const control = screen.getByRole('button', { name: 'Remove Paid social' })
    expect(control.querySelector('.ds-tag-button__dismiss')).toBeInTheDocument()
    expect(contentStyles).toContain('.ds-tag-button__dismiss')
  })

  it('reports SelectionTile selection through a toggle button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectionTile label="Warm" selected onChange={onChange}>Warm palette</SelectionTile>)

    const tile = screen.getByRole('button', { name: 'Deselect Warm' })
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    await user.click(tile)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('autosaves a changed InlineText value on blur and restores its trigger', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<InlineText label="Title" value="Original" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Edit title' }))
    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Updated')
    await user.tab()

    expect(onSave).toHaveBeenCalledWith('Updated')
    expect(await screen.findByRole('button', { name: 'Edit title' })).toHaveTextContent('Updated')
  })

  it('shows the edit affordance on hover/focus without changing the text trigger', () => {
    render(<InlineText label="Title" value="Original" onSave={() => undefined} />)
    const trigger = screen.getByRole('button', { name: 'Edit title' })
    expect(trigger.querySelector('.ds-inline-text-value__edit')).toBeInTheDocument()
    expect(contentStyles).toContain('button.ds-inline-text-value:is(:hover, :focus-visible) .ds-inline-text-value__edit')
    expect(contentStyles).toContain('.ds-inline-text-value:is(:hover, :focus-visible), .ds-inline-text-editor')
    expect(contentStyles).toContain('resize: none')
  })
})
