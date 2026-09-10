import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Tab, TabPanel, Tabs, type TabItem } from '../../index'

const categories: TabItem[] = [
  { value: 'ads', label: 'Ads' },
  { value: 'web', label: 'Web' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'other', label: 'Other' },
]

function Example({ items = categories, idPrefix = 'templates' }: { items?: TabItem[]; idPrefix?: string }) {
  const [value, setValue] = useState(items[0]?.value ?? '')
  return <>
    <Tab items={items} value={value} onValueChange={setValue} ariaLabel="Template categories" idPrefix={idPrefix} />
    {items.map(item => <TabPanel key={item.value} value={item.value} activeValue={value} idPrefix={idPrefix}>
      <input aria-label={`${item.label} draft`} defaultValue="Keep my draft" />
    </TabPanel>)}
  </>
}

describe('Tab', () => {
  test('retains the Tabs compatibility wrapper and public prop contract', () => {
    render(<Tabs items={categories} value="ads" onValueChange={() => {}} ariaLabel="Legacy categories" className="legacy-layout" />)
    expect(screen.getByRole('tablist').parentElement).toHaveClass('legacy-layout')
    expect(screen.getByRole('tab', { name: 'Ads' })).toHaveAttribute('aria-selected', 'true')
  })

  test('matches the category tablist and connects values to labelled panels', async () => {
    const user = userEvent.setup()
    render(<Example />)
    expect(screen.getByRole('tablist', { name: 'Template categories' })).toHaveClass('v2-pill-tabs')
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Ads', 'Web', 'Presentations', 'Other'])
    for (const tab of screen.getAllByRole('tab')) {
      const panel = document.getElementById(tab.getAttribute('aria-controls')!)!
      expect(panel).toHaveAttribute('aria-labelledby', tab.id)
      await user.click(tab)
      expect(tab).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tabpanel', { name: tab.textContent! })).toBe(panel)
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    }
  })

  test('wraps arrows, handles Home/End, and skips visible disabled tabs', async () => {
    const user = userEvent.setup()
    render(<Example items={categories.map(item => ({ ...item, disabled: item.value === 'web' }))} />)
    expect(screen.getByRole('tab', { name: 'Web' })).toBeDisabled()
    await user.tab()
    expect(screen.getByRole('tab', { name: 'Ads' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Presentations' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Presentations' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Presentations' })).toBeVisible()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Ads' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Ads' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Ads' })).toBeVisible()
    expect(screen.getAllByRole('tab').filter(tab => tab.tabIndex === 0)).toHaveLength(1)
    await user.tab()
    expect(screen.getByRole('tabpanel', { name: 'Ads' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Ads draft' })).toHaveFocus()
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    expect(screen.getByRole('tab', { name: 'Ads' })).toHaveFocus()
  })

  test('retains panel drafts across selection changes', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.type(screen.getByRole('textbox', { name: 'Ads draft' }), ' changed')
    await user.click(screen.getByRole('tab', { name: 'Web' }))
    await user.click(screen.getByRole('tab', { name: 'Ads' }))
    expect(screen.getByRole('textbox', { name: 'Ads draft' })).toHaveValue('Keep my draft changed')
  })

  test('keeps repeated labels distinct and safely encodes values in IDs', () => {
    const items = [{ value: 'first value', label: 'Draft' }, { value: 'second/value', label: 'Draft' }]
    const onValueChange = vi.fn()
    render(<><Tab items={items} value="first value" onValueChange={onValueChange} ariaLabel="Drafts" idPrefix="drafts" />
      {items.map(item => <TabPanel key={item.value} value={item.value} activeValue="first value" idPrefix="drafts">{item.value}</TabPanel>)}</>)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].id).not.toBe(tabs[1].id)
    for (const tab of tabs) expect(document.getElementById(tab.getAttribute('aria-controls')!)).toHaveAttribute('aria-labelledby', tab.id)
    fireEvent.click(tabs[1])
    expect(onValueChange).toHaveBeenCalledWith('second/value')
  })

  test('isolates groups with unique prefixes', () => {
    render(<><Example idPrefix="one" /><Example idPrefix="two" /></>)
    const groups = screen.getAllByRole('tablist')
    const ids = groups.flatMap(group => within(group).getAllByRole('tab').map(tab => tab.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('renders disabled items and handles an empty group without callbacks', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { rerender } = render(<Tab items={categories.map(item => ({ ...item, disabled: true }))} value="ads" onValueChange={onValueChange} ariaLabel="Categories" />)
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toBeDisabled()
      expect(tab).toHaveAttribute('tabindex', '-1')
      await user.click(tab)
    }
    expect(onValueChange).not.toHaveBeenCalled()
    rerender(<Tab items={[]} value="" onValueChange={onValueChange} ariaLabel="Categories" />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
