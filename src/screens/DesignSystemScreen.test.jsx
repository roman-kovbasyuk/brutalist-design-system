import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { DesignSystemScreen } from './DesignSystemScreen.jsx'

const designSystemStyles = ['src/styles/design-system.css', 'src/components/design-system/molecules/pill-tabs.css', 'src/components/design-system/molecules/select-menu.css'].map(path => readFileSync(join(process.cwd(), path), 'utf8')).join('\n')

describe('DesignSystemScreen', () => {
  test('uses accessible secondary copy, white selected tabs, and the specified field spacing', () => {
    expect(designSystemStyles).not.toContain('color: var(--v2-muted)')
    expect(designSystemStyles).toMatch(/\.v2-pill-tabs button\[aria-selected="true"\]\s*{[^}]*background:\s*var\(--v2-surface\)/)
    expect(designSystemStyles).toMatch(/\.v2-field textarea\s*{[^}]*padding:\s*var\(--v2-space-3\) var\(--v2-space-4\)/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 :focus-visible,[^}]*outline:\s*2px solid var\(--v2-accent\);[^}]*box-shadow:\s*0 0 0 2px var\(--v2-ink\) !important/)
  })

  test('demonstrates compact navigation, table, cards, and action reflow', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const specimen = screen.getByRole('region', { name: 'Responsive behavior' })
    const toggle = within(specimen).getByRole('button', { name: 'Preview compact layout' })
    expect(within(specimen).getByRole('navigation', { name: 'Responsive workspace' })).toBeVisible()
    expect(within(specimen).getByRole('table', { name: 'Responsive campaign summary' })).toBeVisible()
    expect(within(specimen).getAllByRole('article')).toHaveLength(2)
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).toHaveAttribute('data-compact', 'true')
    await user.click(within(specimen).getByRole('button', { name: 'Save responsive draft' }))
    expect(within(specimen).getByRole('status')).toHaveTextContent('Draft saved')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('supports arrow wrapping, Home, End, and linked panels with roving tab stops', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const preview = screen.getByRole('tab', { name: 'Preview' })
    const code = screen.getByRole('tab', { name: 'Code' })
    await user.click(preview)
    for (const [key, selected, inactive] of [
      ['{ArrowRight}', code, preview], ['{ArrowRight}', preview, code],
      ['{ArrowLeft}', code, preview], ['{Home}', preview, code], ['{End}', code, preview],
    ]) {
      await user.keyboard(key)
      expect(selected).toHaveFocus()
      expect(selected).toHaveAttribute('aria-selected', 'true')
      expect(selected).toHaveAttribute('tabindex', '0')
      expect(inactive).toHaveAttribute('aria-selected', 'false')
      expect(inactive).toHaveAttribute('tabindex', '-1')
      const panel = screen.getByRole('tabpanel', { name: selected.textContent })
      expect(selected).toHaveAttribute('aria-controls', panel.id)
      expect(panel).toHaveAttribute('aria-labelledby', selected.id)
      expect(document.getElementById(inactive.getAttribute('aria-controls'))).not.toBeVisible()
    }
    await user.tab()
    expect(screen.getByRole('tabpanel', { name: 'Code' })).toHaveFocus()
  })

  test.each(['Keep draft', 'Delete draft'])('moves inline confirmation focus in and restores it after %s', async (action) => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    await user.click(screen.getByRole('button', { name: 'Open inline confirmation' }))
    const confirmation = screen.getByRole('group', { name: 'Confirm draft deletion' })
    expect(within(confirmation).getByRole('button', { name: 'Keep draft' })).toHaveFocus()
    await user.click(within(confirmation).getByRole('button', { name: action }))
    expect(screen.queryByRole('group', { name: 'Confirm draft deletion' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open inline confirmation' })).toHaveFocus()
  })

  test('presents the complete UI v2 reference structure', () => {
    render(<DesignSystemScreen />)
    expect(screen.getByRole('heading', { name: 'Application design system' })).toBeVisible()
    for (const name of ['Basics', 'Components', 'UI blocks']) {
      expect(screen.getByRole('tab', { name, exact: true })).toBeVisible()
    }
    expect(screen.getByRole('heading', { name: 'Controls', exact: true })).toBeVisible()
    for (const name of ['Foundations', 'Actions and controls', 'Navigation', 'Feedback', 'Data display', 'Content objects', 'Overlays', 'Motion', 'Responsive behavior']) {
      expect(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(screen.getByText('#79d9ff')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copy Body typography token' })).toBeVisible()
    expect(screen.queryByText('--v2-text-body')).not.toBeInTheDocument()
    expect(screen.queryByText('--v2-line-body')).not.toBeInTheDocument()
    expect(screen.getByText('4px base unit')).toBeVisible()
  })

  test('keeps the documented 48px page role at every breakpoint', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-page-header h1\s*{[^}]*font-size:\s*var\(--v2-text-page\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample--h1 p\s*{[^}]*font-size:\s*var\(--v2-text-h1\);/)
    expect(designSystemStyles).not.toMatch(/\.system-screen--v2 \.(?:v2-page-header h1|v2-type-sample--h1 p)\s*{[^}]*font-size:\s*40px;/)
  })

  test('fills range tracks from the left edge and allows date fields to shrink', () => {
    expect(designSystemStyles).toMatch(/\.v2-date-range\s*{[^}]*min-width:\s*0;/)
    expect(designSystemStyles).toMatch(/input\[type="range"\]::-webkit-slider-runnable-track\s*{[^}]*linear-gradient\(/)
    expect(designSystemStyles).toContain('var(--v2-range-progress, 0%)')
  })

  test('gives every custom dropdown the shared raised menu treatment', () => {
    expect(designSystemStyles).toMatch(/\.v2-floating-listbox\s*{[^}]*border:\s*2px solid var\(--v2-border\);[^}]*box-shadow:\s*8px 8px 0 var\(--v2-ink\);/)
    expect(designSystemStyles).toMatch(/\.v2-listbox-option\[aria-selected="true"\]\s*{[^}]*background:\s*var\(--v2-accent\);/)
    expect(designSystemStyles).toMatch(/\.v2-listbox-option:not\(\[aria-selected="true"\]\):hover\s*{[^}]*background:/)
  })

  test('keeps stepper value fields padded while preserving native number arrows', () => {
    expect(designSystemStyles).toMatch(/\.v2-stepper input\s*{[^}]*padding-right:\s*var\(--v2-space-4\);[^}]*padding-left:\s*var\(--v2-space-4\);/)
    expect(designSystemStyles).toMatch(/\.v2-stepper input\s*{[^}]*text-align:\s*center;/)
  })

  test('exposes an editable hex value alongside the color picker', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const hex = screen.getByRole('textbox', { name: 'Campaign color hex' })
    expect(hex).toHaveValue('#79D9FF')
    await user.clear(hex)
    await user.type(hex, '#23A094')
    expect(hex).toHaveValue('#23A094')
    expect(screen.getByLabelText('Campaign color')).toHaveValue('#23a094')
  })

  test('gives content tabs a visible transition and reduced-motion fallback', () => {
    expect(designSystemStyles).toMatch(/\.v2-pill-tabs button\s*{[^}]*transition:[^}]*transform var\(--v2-duration-disclosure\)/)
    expect(designSystemStyles).toMatch(/\.v2-pill-tabs button\[aria-selected="true"\]\s*{[^}]*animation:\s*v2-tab-select var\(--v2-duration-disclosure\)/)
    expect(designSystemStyles).toMatch(/prefers-reduced-motion:[^)]*[\s\S]*\.v2-pill-tabs button\[aria-selected="true"\]\s*{[^}]*transform:\s*none;/)
  })

  test('removes native spinners from inline currency fields only', () => {
    expect(designSystemStyles).toMatch(/\.v2-input-shell input\[type="number"\]\s*{[^}]*appearance:\s*textfield;/)
    expect(designSystemStyles).toMatch(/\.v2-input-shell input\[type="number"\]::\-webkit-inner-spin-button,[\s\S]*appearance:\s*none;/)
    expect(designSystemStyles).toMatch(/\.v2-stepper input\s*{/) // dedicated steppers retain their arrows
  })

  test('gives every clickable surface a shared hover and press baseline', () => {
    expect(designSystemStyles).toMatch(/:where\(button, a, summary, input\[type="checkbox"\], input\[type="radio"\], input\[type="color"\], input\[type="range"\]\)/)
    expect(designSystemStyles).toMatch(/:not\(:disabled\):hover\s*{[^}]*filter:\s*brightness\(0\.96\);/)
    expect(designSystemStyles).toMatch(/:not\(:disabled\):active\s*{[^}]*transform:\s*translateY\(1px\) scale\(0\.99\);/)
  })

  test('highlights data table rows on hover without changing their layout', () => {
    expect(designSystemStyles).toMatch(/\.v2-data-table tbody tr:hover > \*\s*{[^}]*background:\s*color-mix\(/)
    expect(designSystemStyles).toMatch(/\.v2-data-table tbody tr:hover > \*\s*{[^}]*box-shadow:\s*inset 0 2px 0 var\(--v2-accent\)/)
  })

  test('presents the pill radius only in its compact status context', () => {
    render(<DesignSystemScreen />)
    const shapeSpecimen = screen.getByRole('heading', { name: 'Shape' }).closest('.v2-foundation-card')
    expect(within(shapeSpecimen).getByText('Ready')).toBeVisible()
    expect(within(shapeSpecimen).getByText('Compact status')).toBeVisible()
    expect(screen.queryByText('Full pill')).not.toBeInTheDocument()
  })

  test('keeps segmented-control focus outlines outside unclipped children', () => {
    expect(designSystemStyles).not.toMatch(
      /\.system-screen--v2 \.v2-segmented-control\s*{[^}]*overflow:\s*hidden;/,
    )
  })

  test('demonstrates interactive control and navigation states', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const codeTab = screen.getByRole('tab', { name: 'Code' })
    await user.click(codeTab)
    expect(codeTab).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('checkbox', { name: 'Include animated formats' }))
    expect(screen.getByRole('checkbox', { name: 'Include animated formats' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Validate brief' }))
    expect(screen.getByText('Add a campaign objective')).toHaveRole('alert')
  })

  test('shows feedback, data, and production object patterns', () => {
    render(<DesignSystemScreen />)
    expect(screen.getByRole('status', { name: 'Campaign processing' })).toBeVisible()
    expect(screen.getByRole('progressbar', { name: 'Generation progress' })).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByRole('table', { name: 'Campaign performance' })).toBeVisible()
    expect(screen.getByText('Prompt card')).toBeVisible()
    expect(screen.getByText('Review required')).toBeVisible()
  })

  test('uses truthful noninteractive semantics for inert production objects', () => {
    render(<DesignSystemScreen />)
    const contentObjects = screen.getByRole('region', { name: 'Content objects' })

    expect(within(contentObjects).queryAllByRole('button')).toHaveLength(0)
    for (const name of ['Campaign card', 'Prompt card', 'Asset tile', 'Banner preview', 'Review required']) {
      const object = within(contentObjects).getByRole('article', { name })
      expect(object).toBeVisible()
      expect(object).not.toHaveAttribute('tabindex')
    }
  })

  test('distinguishes generated asset and assembled banner thumbnails', () => {
    render(<DesignSystemScreen />)

    const asset = screen.getByRole('img', { name: 'Generated asset thumbnail' })
    expect(within(asset).getByText('OSLO / 07:42')).toBeVisible()
    expect(within(asset).getByText('Generated asset')).toBeVisible()

    const banner = screen.getByRole('img', { name: 'Assembled banner thumbnail' })
    expect(within(banner).getByText('Speak before you land.')).toBeVisible()
    expect(within(banner).getByText('Start learning')).toBeVisible()
  })

  test('uses high-contrast ink for danger status text', () => {
    expect(designSystemStyles).toMatch(
      /\.system-screen--v2 \.v2-status-label--danger\s*{[^}]*color:\s*var\(--v2-ink\);/,
    )
  })

  test('opens and closes the overlay specimens accessibly', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const trigger = screen.getByRole('button', { name: 'Open confirmation dialog' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Delete generated asset?' })
    expect(dialog).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByRole('dialog', { name: 'Delete generated asset?' }),
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(screen.getByText('Disclosure behavior'))
    expect(screen.getByText('The chevron rotates over 200ms.')).toBeVisible()
  })

  test('keeps modal keyboard focus inside and restores its trigger on Escape', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const trigger = screen.getByRole('button', { name: 'Open confirmation dialog' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Delete generated asset?' })
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete asset' })
    expect(cancel).toHaveFocus()

    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Delete generated asset?' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('exposes dropdown, confirmation, tooltip, and toast actions without hover', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const dropdownTrigger = screen.getByRole('button', { name: 'Open asset actions' })
    expect(dropdownTrigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(dropdownTrigger)
    expect(dropdownTrigger).toHaveAttribute('aria-expanded', 'true')
    const assetActions = screen.getByRole('group', { name: 'Asset actions' })
    expect(assetActions).toBeVisible()
    expect(within(assetActions).getByRole('button', { name: 'Download asset' })).toBeVisible()
    expect(within(assetActions).getByRole('button', { name: 'Duplicate asset' })).toBeVisible()
    expect(screen.queryByRole('menu', { name: 'Asset actions' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open inline confirmation' }))
    const confirmation = screen.getByRole('group', { name: 'Confirm draft deletion' })
    expect(within(confirmation).getByText('Delete campaign draft?')).toBeVisible()
    await user.click(within(confirmation).getByRole('button', { name: 'Keep draft' }))
    expect(screen.queryByRole('group', { name: 'Confirm draft deletion' })).not.toBeInTheDocument()

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Motion never hides an action or status.')
    expect(screen.getByRole('button', { name: 'About motion feedback' })).toHaveAttribute(
      'aria-describedby',
      tooltip.id,
    )

    await user.click(screen.getByRole('button', { name: 'Show success toast' }))
    const toast = screen.getByRole('status', { name: 'Motion preference saved' })
    expect(toast).toBeVisible()
    await user.click(within(toast).getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByRole('status', { name: 'Motion preference saved' })).not.toBeInTheDocument()
  })

  test('keeps open overlay surfaces flat until an interaction supplies elevation', () => {
    const dropdownSurfaceRule = designSystemStyles.match(
      /\.system-screen--v2 \.v2-dropdown__popover\s*{([^}]*)}/,
    )?.[1]
    const modalRule = designSystemStyles.match(
      /\.system-screen--v2 \.v2-modal\s*{([^}]*)}/,
    )?.[1]

    expect(dropdownSurfaceRule).toBeDefined()
    expect(dropdownSurfaceRule).not.toMatch(/box-shadow:/)
    expect(modalRule).toBeDefined()
    expect(modalRule).not.toMatch(/box-shadow:/)
  })

  test('binds motion specimens to the timing and reduced-motion contract', () => {
    render(<DesignSystemScreen />)

    expect(screen.getByRole('button', { name: 'Preview button lift' })).toHaveClass('v2-button')
    expect(screen.getByRole('button', { name: 'Preview card shadow' })).toHaveClass('v2-motion-card')
    expect(designSystemStyles).toMatch(
      /\.system-screen--v2 \.v2-motion-card\s*{[^}]*transition:[^;]*var\(--v2-duration-fast\)/,
    )
    expect(designSystemStyles).toMatch(
      /\.system-screen--v2 \.v2-disclosure__chevron\s*{[^}]*transition:\s*transform var\(--v2-duration-disclosure\) ease-out;/,
    )
    expect(designSystemStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(designSystemStyles).toMatch(
      /\.system-screen--v2 \*,\s*\.system-screen--v2 \*::before,\s*\.system-screen--v2 \*::after\s*{[^}]*animation:\s*none !important;[^}]*scroll-behavior:\s*auto !important;/,
    )
    expect(designSystemStyles).toMatch(
      /\.system-screen--v2 \.v2-button[^}]*\.system-screen--v2 \.v2-motion-card[^}]*{[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/,
    )
    expect(designSystemStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.system-screen--v2 \.v2-motion-card:hover\s*{[^}]*border-color:\s*var\(--v2-accent\);/,
    )
  })

  test('presents the expanded picker, slider, and progress catalog with truthful semantics', () => {
    render(<DesignSystemScreen />)

    expect(screen.getByRole('searchbox', { name: 'Search campaigns' })).toBeVisible()
    expect(screen.getByLabelText('Campaign start')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('Campaign end')).toHaveAttribute('type', 'date')
    expect(screen.getByRole('combobox', { name: 'Find a market' })).toBeVisible()
    expect(screen.getByRole('slider', { name: 'Campaign intensity' })).toHaveValue('60')
    expect(screen.getByRole('slider', { name: 'Minimum audience age' })).toHaveValue('25')
    expect(screen.getByRole('slider', { name: 'Maximum audience age' })).toHaveValue('55')
    expect(screen.getByRole('progressbar', { name: 'Asset generation' })).toHaveAttribute(
      'aria-valuenow',
      '68',
    )
    expect(screen.getByRole('progressbar', { name: 'Preparing export' })).not.toHaveAttribute(
      'aria-valuenow',
    )
  })

  test('supports keyboard autocomplete selection and empty results', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const market = screen.getByRole('combobox', { name: 'Find a market' })
    await user.type(market, 'os')
    expect(screen.getByRole('listbox', { name: 'Market suggestions' })).toBeVisible()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(market).toHaveValue('Oslo')
    expect(market).toHaveAttribute('aria-expanded', 'false')

    await user.clear(market)
    await user.type(market, 'moon')
    expect(screen.getByText('No markets match “moon”.')).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox', { name: 'Market suggestions' })).not.toBeInTheDocument()
  })

  test('updates dropdown, multiselect, stepper, rating, and slider controls', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const statusTrigger = screen.getByRole('button', { name: 'Open campaign status options' })
    await user.click(statusTrigger)
    await user.click(screen.getByRole('option', { name: 'Ready' }))
    expect(statusTrigger).toHaveTextContent('Ready')
    expect(statusTrigger).toHaveAttribute('aria-expanded', 'false')

    const channelTrigger = screen.getByRole('button', { name: 'Open channel options' })
    await user.click(channelTrigger)
    const channelOptions = screen.getByRole('listbox', { name: 'Channel options' })
    await user.click(within(channelOptions).getByRole('option', { name: 'Email' }))
    expect(channelTrigger).toHaveTextContent('2 selected')
    expect(screen.getByText('Email', { selector: '.v2-selection-chip' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Increase variation count' }))
    expect(screen.getByRole('spinbutton', { name: 'Variation count' })).toHaveValue(4)
    await user.click(screen.getByRole('radio', { name: '4 stars' }))
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked()

    const intensity = screen.getByRole('slider', { name: 'Campaign intensity' })
    fireEvent.change(intensity, { target: { value: '61' } })
    expect(intensity).toHaveValue('61')
    expect(screen.getByText('61%', { selector: 'output' })).toBeVisible()
  })

  test.each([
    ['campaign status', 'Open campaign status options', 'Campaign status options'],
    ['channel', 'Open channel options', 'Channel options'],
  ])('closes the %s listbox on Escape and restores trigger focus', async (_, triggerName, listName) => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const trigger = screen.getByRole('button', { name: triggerName })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: listName })
    const firstOption = within(listbox).getAllByRole('option')[0]
    firstOption.focus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: listName })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('defines hover and press feedback for every interactive control family', () => {
    for (const selector of [
      '.v2-button:not(:disabled):hover',
      '.v2-choice-group label:hover',
      '.v2-check-control:hover',
      '.v2-switch:hover',
      '.v2-file-drop:hover',
      '.v2-interactive-control:not(:disabled):active',
      'input[type="range"]:active',
    ]) {
      expect(designSystemStyles).toContain(selector)
    }
  })
})
