import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Breadcrumbs } from './Breadcrumbs'
import { Pagination } from './Pagination'
import { SegmentedControl } from './SegmentedControl'
import { Stepper } from './Stepper'
import { useState } from 'react'
import { Tabs, TabPanel } from './Tabs'
import { PillTabs, PillTabPanel } from '../../molecules/PillTabs.jsx'

function TabContractExample({ prefix = 'details' }: { prefix?: string }) {
  const [value, setValue] = useState('usage')
  return <>
    <Tabs idPrefix={prefix} ariaLabel="Details" value={value} onValueChange={setValue} items={[
      { value: 'usage', label: 'How to use' },
      { value: 'locked', label: 'Unavailable', disabled: true },
      { value: 'first', label: 'Example' },
      { value: 'second', label: 'Example' },
    ]} />
    <TabPanel idPrefix={prefix} value="usage" activeValue={value}>Instructions</TabPanel>
    <TabPanel idPrefix={prefix} value="locked" activeValue={value}>Locked content</TabPanel>
    <TabPanel idPrefix={prefix} value="first" activeValue={value}>First example</TabPanel>
    <TabPanel idPrefix={prefix} value="second" activeValue={value}>Second example</TabPanel>
  </>
}

describe('tab identity and compatibility', () => {
  it('keeps exact legacy label selection when slugs collide', async () => {
    function Example() {
      const [value, setValue] = useState('Foo Bar')
      return <><PillTabs tabs={['Foo Bar', 'foo-bar']} value={value} onChange={setValue} ariaLabel="Legacy collision" />
        <PillTabPanel tab="Foo Bar" value={value}>First</PillTabPanel>
        <PillTabPanel tab="foo-bar" value={value}>Second</PillTabPanel></>
    }
    render(<Example />)
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('First')
    await userEvent.setup().click(screen.getByRole('tab', { name: 'foo-bar' }))
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second')
  })

  it('preserves punctuation in legacy slug IDs', () => {
    render(<><PillTabs tabs={['R&D']} value="R&D" onChange={() => {}} ariaLabel="Legacy punctuation" idPrefix="legacy" />
      <PillTabPanel tab="R&D" value="R&D" idPrefix="legacy">Research</PillTabPanel></>)
    expect(screen.getByRole('tab')).toHaveAttribute('id', 'legacy-r&d-tab')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'legacy-r&d-panel')
  })

  it('connects differently labelled values to their actual panels', () => {
    render(<TabContractExample />)
    const tab = screen.getByRole('tab', { name: 'How to use' })
    const panel = screen.getByRole('tabpanel')
    expect(document.getElementById(tab.getAttribute('aria-controls')!)).toBe(panel)
    expect(document.getElementById(panel.getAttribute('aria-labelledby')!)).toBe(tab)
    expect(panel).toHaveAccessibleName('How to use')
  })

  it('distinguishes duplicate labels and shows the selected value panel', async () => {
    const user = userEvent.setup()
    render(<TabContractExample />)
    const tabs = screen.getAllByRole('tab', { name: 'Example' })
    expect(tabs[0].id).not.toBe(tabs[1].id)
    await user.click(tabs[1])
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second example')
  })

  it('keeps disabled tabs visible and skips them during keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<TabContractExample />)
    const disabled = screen.getByRole('tab', { name: 'Unavailable' })
    expect(disabled).toBeDisabled()
    await user.click(disabled)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Instructions')
    await user.click(screen.getByRole('tab', { name: 'How to use' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getAllByRole('tab', { name: 'Example' })[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second example')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'How to use' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}{Home}')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Instructions')
  })

  it('keeps supplied group prefixes distinct', () => {
    render(<><TabContractExample prefix="left" /><TabContractExample prefix="right" /></>)
    const tabs = screen.getAllByRole('tab', { name: 'How to use' })
    expect(tabs[0].id).not.toBe(tabs[1].id)
    for (const tab of tabs) expect(document.getElementById(tab.getAttribute('aria-controls')!)).toBeVisible()
  })

  it('preserves legacy label callbacks and slug-based panel relationships', async () => {
    function LegacyExample() {
      const [value, setValue] = useState('First view')
      return <><PillTabs idPrefix="legacy" ariaLabel="Legacy" tabs={['First view', 'Other view']} value={value} onChange={setValue} />
        <PillTabPanel idPrefix="legacy" tab="First view" value={value}>First</PillTabPanel>
        <PillTabPanel idPrefix="legacy" tab="Other view" value={value}>Other</PillTabPanel></>
    }
    const user = userEvent.setup()
    render(<LegacyExample />)
    await user.click(screen.getByRole('tab', { name: 'Other view' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Other')
    expect(screen.getByRole('tab', { name: 'Other view' })).toHaveAttribute('aria-controls', 'legacy-other-view-panel')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'legacy-other-view-tab')
  })
})

describe('portable navigation controls', () => {
  it('keeps tab selection and arrow-key focus in one accessible tablist', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Tabs ariaLabel="Editor sections" value="content" onValueChange={onValueChange} items={[{ value: 'content', label: 'Content' }, { value: 'style', label: 'Style' }]} />)

    const content = screen.getByRole('tab', { name: 'Content' })
    expect(content.closest('.v2-pill-tabs')).toBeInTheDocument()
    expect(content).toHaveAttribute('aria-selected', 'true')
    await user.click(content)
    await user.keyboard('{ArrowRight}')
    expect(onValueChange).toHaveBeenCalledWith('style')
    expect(screen.getByRole('tab', { name: 'Style' })).toHaveFocus()
  })

  it('exposes the selected segmented control option as a radio', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<SegmentedControl ariaLabel="Canvas size" value="square" onValueChange={onValueChange} options={[{ value: 'square', label: 'Square' }, { value: 'wide', label: 'Wide' }]} />)

    expect(screen.getByRole('radio', { name: 'Square' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Wide' }))
    expect(onValueChange).toHaveBeenCalledWith('wide')
  })

  it('marks the current breadcrumb and keeps earlier items as links', () => {
    render(<Breadcrumbs items={[{ label: 'Library', href: '/library' }, { label: 'Buttons' }]} />)

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(screen.getByText('Buttons')).toHaveAttribute('aria-current', 'page')
  })

  it('labels pagination and prevents its previous control below the first page', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={1} pageCount={3} onPageChange={onPageChange} />)

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Page 2' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('announces step progress and identifies the current step', () => {
    render(<Stepper activeStep={1} steps={[{ label: 'Brief' }, { label: 'Copy' }, { label: 'Review' }]} />)

    expect(screen.getByRole('list', { name: 'Progress' })).toHaveAttribute('aria-label', 'Progress')
    expect(screen.getByText('Copy').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Brief').closest('li')).toHaveAttribute('data-status', 'complete')
  })
})
