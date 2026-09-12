import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { DesignSystemScreen } from './DesignSystemScreen.jsx'
import { PillTabs, PillTabPanel } from '../components/design-system/molecules/PillTabs.jsx'
import { useState } from 'react'

const designSystemStyles = ['src/styles/design-system.css', 'src/components/design-system/charts/charts.css', 'src/components/design-system/molecules/pill-tabs.css', 'src/components/design-system/molecules/select-menu.css', 'src/components/design-system/atoms/token-copy-target.css', 'src/components/design-system/atoms/token-chip.css', 'src/components/design-system/components/forms/forms.css', 'src/components/design-system/components/overlays/overlays.css', 'src/components/design-system/components/content/content.css', 'src/components/design-system/examples/library-index.css', 'src/components/design-system/examples/basics-catalog.css', 'src/components/design-system/basics/layout/layout.css'].map(path => readFileSync(join(process.cwd(), path), 'utf8')).join('\n')
const workflowStyles = readFileSync(join(process.cwd(), 'src/components/design-system/workflow-steps.css'), 'utf8')
const componentCopy = reference => `Use this component ${reference} from the app design system (brutalist design system)`

describe('DesignSystemScreen', () => {
  test('renders the home summary, search, and latest updates', async () => {
    const user = userEvent.setup()
    history.replaceState({}, '', '/design-system')
    render(<DesignSystemScreen overviewOnRoot />)
    expect(screen.getByRole('heading', { name: 'Design system' })).toBeVisible()
    expect(screen.getByText('Basics assets')).toBeVisible()
    expect(screen.getByText('Changes last week')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Latest updates' })).toBeVisible()
    const search = screen.getByRole('searchbox', { name: 'Search the design system' })
    await user.type(search, 'dropdown')
    const result = (await screen.findAllByText('Dropdowns'))[0]
    expect(result.closest('a')).toHaveAttribute('href', '/?section=components#components-dropdowns')
    expect(screen.queryByRole('heading', { name: 'Foundations' })).not.toBeInTheDocument()
  })

  test('uses accessible secondary copy, white selected tabs, and the specified field spacing', () => {
    expect(designSystemStyles).not.toContain('color: var(--v2-muted)')
    expect(designSystemStyles).toMatch(/\.v2-pill-tabs button\[aria-selected="true"\]\s*{[^}]*background:\s*var\(--v2-surface\)/)
    expect(designSystemStyles).toMatch(/\.v2-field textarea\s*{[^}]*padding:\s*var\(--v2-space-3\) var\(--v2-space-4\)/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 :focus-visible,[^}]*outline:\s*2px solid var\(--v2-accent\);[^}]*box-shadow:\s*0 0 0 2px var\(--v2-ink\) !important/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2\s*{[^}]*max-width:\s*1000px;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-token-target \.v2-token-copy-target__icon\s*{[^}]*border:\s*0;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-token-target \.v2-token-copy-target__icon\s*{[^}]*transform:\s*translate\(50%, -50%\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample \.v2-token-copy-target__button\s*{[^}]*grid-template-columns:\s*92px minmax\(0, 1fr\) auto;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-swatch:nth-child\(4\) \.v2-color-swatch__sample\s*{[^}]*border-bottom:\s*0;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-section--unwrapped\s*{[^}]*border:\s*0;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-tag-grid\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/)
    expect(designSystemStyles).toMatch(/\.ds-tag--filled\.ds-tag--neutral\s*{[^}]*background:\s*var\(--v2-surface\);/)
  })

  test('keeps catalog typography on the Basics font token', () => {
    expect(designSystemStyles).not.toContain('system-ui')
    expect(designSystemStyles).toMatch(/\.system-screen--v2\s*{[^}]*font-family:\s*var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 code\s*{[^}]*font-family:\s*var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.ds-dialog,[\s\S]*font-family:\s*var\(--v2-font\);/)
  })

  test('elevates only the explicitly marked form wrapper', () => {
    expect(designSystemStyles).toMatch(/\.ds-form-section--elevated\s*{[^}]*box-shadow:\s*var\(--v2-shadow-small\);/)
  })

  test('keeps token samples flat while allowing icon tiles to lift', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.ds-button\.v2-token-copy-target__button:not\(:disabled\):not\(\[aria-disabled='true'\]\):is\(:hover, :active\)\s*{[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.ds-basics \.ds-basic-group:focus-within\s*{[^}]*box-shadow:\s*var\(--v2-shadow-interactive\)/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.ds-basics \.ds-basic-group:hover\s*{[^}]*box-shadow:\s*var\(--v2-shadow-interactive\)/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.ds-basics \.ds-basic-icon-tile \.v2-token-copy-target__button:not\(:disabled\):not\(\[aria-disabled='true'\]\):hover\s*{[^}]*box-shadow:\s*var\(--v2-shadow-interactive\)/)
  })

  test('removes quiet-button underlines from inline Basic font samples', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-token-copy-target--inline \.ds-button\.v2-token-copy-target__button\s*{[^}]*text-decoration:\s*none;/)
  })

  test('keeps inline field actions flush on the block axis', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-inline-action\s*{[^}]*padding-block:\s*0;/)
  })

  test('renders the campaign color as a filled circle without a native square stroke', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-input--swatch input\[type="color"\]\s*{[^}]*border:\s*0;[^}]*border-radius:\s*50%;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-input--swatch input\[type="color"\]::-(?:webkit-color-swatch|moz-color-swatch)\s*{[^}]*border:\s*0;[^}]*border-radius:\s*50%;/)
  })

  test('exposes button anatomy toggles and copies the selected state', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const buttons = screen.getByRole('heading', { name: 'Buttons' }).closest('.v2-specimen-card')
    expect(within(buttons).getByRole('switch', { name: 'Left icon' })).toBeChecked()
    expect(within(buttons).getByRole('switch', { name: 'Right icon' })).toBeChecked()
    expect(within(buttons).getByRole('switch', { name: 'Caption' })).toBeChecked()

    const primary = within(buttons).getByRole('button', { name: 'Create campaign' }).closest('.v2-button-cell')
    const danger = within(buttons).getByRole('button', { name: 'Delete draft' }).closest('.v2-button-cell')
    const buttonCells = [...buttons.querySelectorAll('.v2-button-grid .ds-button')]
      .map((button) => button.closest('.v2-button-cell'))
    expect(buttonCells).toHaveLength(6)
    for (const cell of buttonCells) {
      expect(cell).toHaveAttribute('data-component-reference', expect.stringContaining('leftIcon'))
      expect(cell).toHaveAttribute('data-component-reference', expect.stringContaining('rightIcon'))
    }
    expect(primary).toHaveAttribute('data-component-reference', 'AppButton variant="primary" leftIcon rightIcon caption')

    await user.click(within(buttons).getByRole('switch', { name: 'Right icon' }))
    expect(primary).toHaveAttribute('data-component-reference', 'AppButton variant="primary" leftIcon caption')
    expect(within(buttons).queryByRole('button', { name: 'Create campaign' })).toBeInTheDocument()
    expect(primary.querySelector('svg.lucide-arrow-right')).not.toBeInTheDocument()
    expect(primary.querySelector('svg.lucide-arrow-left')).toBeInTheDocument()

    await user.click(within(buttons).getByRole('switch', { name: 'Caption' }))
    expect(primary).toHaveAttribute('data-component-reference', 'AppButton variant="primary" leftIcon')
    expect(primary.querySelector('.ds-button')).toHaveTextContent('')

    await user.click(within(buttons).getByRole('switch', { name: 'Left icon' }))
    expect(primary).toHaveAttribute('data-component-reference', 'AppButton variant="primary"')
    expect(primary.querySelector('svg.lucide-arrow-left')).not.toBeInTheDocument()
    expect(danger).toHaveAttribute('data-component-reference', 'AppButton variant="danger"')
    expect(danger.querySelector('svg')).not.toBeInTheDocument()

    const loading = within(buttons).getByRole('button', { name: 'Generating…' }).closest('.v2-button-cell')
    expect(loading.querySelector('.ds-button__spinner')).not.toBeInTheDocument()
  })

  test('uses doubled padding for comparable foundation and specimen blocks', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-foundation-group__heading\s*{[^}]*padding:\s*var\(--v2-space-8\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-swatch\s*{[^}]*padding:\s*var\(--v2-space-6\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample\s*{[^}]*padding:\s*var\(--v2-space-8\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-foundation-card\s*{[^}]*padding:\s*var\(--v2-space-8\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-specimen-card__heading\s*{[^}]*padding:\s*var\(--v2-space-8\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-specimen-card__body\s*{[^}]*padding:\s*var\(--v2-space-8\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample \.v2-token-copy-target__button\s*{[^}]*align-items:\s*center;[^}]*padding:\s*0;[^}]*border-radius:\s*0;/)
  })

  test('uses proportional measurement bars for the spacing scale', () => {
    expect(designSystemStyles).toContain('.system-screen--v2 .v2-spacing-step__measure')
    expect(designSystemStyles).toContain('width: max(8px, calc(var(--v2-spacing-value) * 1.5))')
    expect(designSystemStyles).toContain('border-bottom: 1px solid var(--v2-border)')
  })

  test('uses 36px spacing between the category navigation and library tree', () => {
    expect(designSystemStyles).toMatch(/\.ds-library-tree\s*{[^}]*margin-top:\s*36px;/)
  })

  test('keeps the library search focus highlight on its wrapper', () => {
    expect(designSystemStyles).toMatch(/\.ds-search:focus-within\s*{[^}]*outline:\s*2px solid var\(--v2-accent\);[^}]*box-shadow:\s*0 0 0 2px var\(--v2-ink\) !important;/)
    expect(designSystemStyles).toMatch(/\.ds-search input:focus-visible\s*{[^}]*outline:\s*0;[^}]*box-shadow:\s*none !important;/)
  })

  test('presents button actions in equal grid cells with surface copy behavior', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const buttons = screen.getByRole('heading', { name: 'Buttons' }).closest('.v2-specimen-card')
    expect(buttons.querySelector('.v2-button-grid')).toBeInTheDocument()
    expect(buttons.querySelectorAll('.v2-button-cell')).toHaveLength(6)
    expect(within(buttons).queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()

    await user.click(within(buttons).getByRole('button', { name: 'Create campaign' }).closest('.v2-button-cell'))
    expect(await navigator.clipboard.readText()).toBe(componentCopy('AppButton variant="primary" leftIcon rightIcon caption'))
    expect(screen.getByText('Copied', { selector: '.v2-token-copy-target__feedback' })).toBeVisible()
  })

  test('shows a pointer-following copy label and check confirmation without the old icon', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const target = screen.getByRole('button', { name: 'Copy Body typography token' })
    const wrapper = target.closest('.v2-token-copy-target')

    fireEvent.pointerMove(target, { clientX: 40, clientY: 24 })
    const feedback = document.querySelector('.v2-token-copy-target__feedback--visible')
    expect(feedback).toHaveTextContent('var(--v2-text-body)')
    expect(feedback.style.getPropertyValue('--copy-x')).toBe('40px')
    expect(wrapper.querySelector('.v2-token-copy-target__icon')).not.toBeInTheDocument()

    await user.click(target)
    expect(screen.getByText('Copied', { selector: '.v2-token-copy-target__feedback' })).toBeVisible()
    expect(screen.getByText('Copied').querySelector('.lucide-check')).toBeInTheDocument()
  })

  test('uses 500 weight for control copy and the requested type samples', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-field input,[\s\S]*font-weight:\s*var\(--v2-weight-heading\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-field input::placeholder,[\s\S]*font-weight:\s*var\(--v2-weight-heading\);/)
    expect(designSystemStyles).toMatch(/\.v2-select-trigger\s*{[^}]*font-weight:\s*var\(--v2-weight-heading\) !important;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-input__hex\s*{[^}]*font-weight:\s*var\(--v2-weight-heading\) !important;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample--lead-large p\s*{[^}]*font-weight:\s*var\(--v2-weight-heading\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample--lead-medium p\s*{[^}]*font-weight:\s*var\(--v2-weight-heading\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample--body p\s*{[^}]*font-weight:\s*var\(--v2-weight-heading\);/)
  })

  test('uses Basics typography and no vertical spacing between radio options', () => {
    expect(designSystemStyles).toMatch(/\.ds-radio-group\s*{[^}]*font:\s*var\(--v2-weight-text\) var\(--v2-text-body\)\s*\/\s*var\(--v2-line-body\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.ds-radio-group__options\s*{[^}]*gap:\s*0;/)
  })

  test('keeps radio option hover feedback borderless', () => {
    expect(designSystemStyles).toMatch(/\.ds-radio-group__options \.ds-choice-field__label:not\(:has\(\.ds-choice-field__control:disabled\)\):hover\s*{[^}]*background:\s*color-mix\(in srgb, var\(--v2-accent\) 14%, var\(--v2-surface\)\);/)
    expect(designSystemStyles).not.toMatch(/\.ds-radio-group__options \.ds-choice-field__label:not\(:has\(\.ds-choice-field__control:disabled\)\):hover\s*{[^}]*border-color:/)
  })

  test('applies minus three percent tracking to the H1 typography specimen', () => {
    const rule = designSystemStyles.match(
      /\.system-screen--v2 \.v2-type-sample--h1 \.v2-type-sample__copy\s*{([^}]*)}/,
    )?.[1]
    expect(rule).toMatch(/letter-spacing:\s*-0\.03em;/)
  })

  test('applies minus two percent tracking to the H2 typography specimen', () => {
    const rule = designSystemStyles.match(
      /\.system-screen--v2 \.v2-type-sample--h2 \.v2-type-sample__copy\s*{([^}]*)}/,
    )?.[1]
    expect(rule).toMatch(/letter-spacing:\s*-0\.02em;/)
  })

  test('keeps navigation focused on workflow primitives after removing the sidebar row specimen', () => {
    expect(designSystemStyles).toMatch(/\.ds-selection-control-stack\s*{[^}]*gap:\s*var\(--v2-space-4\);/)
    render(<DesignSystemScreen />)
    expect(screen.getByRole('heading', { name: 'Workflow steps' })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Sidebar specimen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sidebar row' })).not.toBeInTheDocument()
  })

  test('shows horizontal and vertical workflow step variants', () => {
    render(<DesignSystemScreen />)
    const specimen = screen.getByRole('heading', { name: 'Workflow steps' }).closest('.v2-specimen-card')
    expect(within(specimen).getByText('Horizontal')).toBeVisible()
    expect(within(specimen).getByText('Vertical')).toBeVisible()
    expect(within(specimen).getAllByRole('list', { name: 'Campaign workflow' })).toHaveLength(2)
  })

  test('offers a mobile preview toggle for workflow steps', () => {
    render(<DesignSystemScreen />)
    const specimen = screen.getByRole('heading', { name: 'Workflow steps' }).closest('.v2-specimen-card')
    expect(within(specimen).getByRole('switch', { name: 'Mobile preview' })).toBeInTheDocument()
    expect(workflowStyles).toMatch(/\.v2-workflow-steps-shell--mobile \.v2-workflow-steps--horizontal\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/)
  })

  test('renders the Tabs and view controls tab component', () => {
    render(<DesignSystemScreen />)
    const specimen = screen.getByRole('heading', { name: 'Tabs and view controls' }).closest('.v2-specimen-card')
    expect(within(specimen).queryByText('Layout density', { selector: '.v2-demo-label' })).not.toBeInTheDocument()
    expect(within(specimen).getByRole('tablist', { name: 'View density' })).toBeInTheDocument()
    expect(within(specimen).getByRole('tab', { name: 'Comfortable' })).toHaveAttribute('aria-selected', 'true')
    expect(within(specimen).getByRole('tab', { name: 'Spacious' })).toHaveAttribute('aria-selected', 'false')
    expect(within(specimen).getByRole('switch', { name: 'Compact' })).toBeInTheDocument()
  })

  test('moves the segmented selection pill across all density options', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const specimen = screen.getByRole('heading', { name: 'Tabs and view controls' }).closest('.v2-specimen-card')
    const spacious = within(specimen).getByRole('tab', { name: 'Spacious' })
    await user.click(spacious)
    expect(spacious).toHaveAttribute('aria-selected', 'true')
    expect(within(specimen).getByRole('tab', { name: 'Comfortable' })).toHaveAttribute('aria-selected', 'false')
    expect(within(specimen).getByRole('tablist', { name: 'View density' }).querySelectorAll('.v2-segmented-control__indicator')).toHaveLength(1)
  })

  test('styles tabs, switches, progress text, and pagination with canonical treatments', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-segmented-control\s*{[^}]*border-radius:\s*var\(--v2-radius-pill\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-segmented-control__indicator\s*{[^}]*position:\s*absolute;[^}]*background:\s*var\(--v2-ink\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-segmented-control button:not\(\[aria-selected="true"\]\):hover\s*{[^}]*background:\s*transparent;[^}]*color:\s*var\(--v2-text-secondary\);[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-segmented-control\s*{[^}]*grid-template-columns:\s*repeat\(3, max-content\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-segmented-control\s*{[^}]*gap:\s*var\(--v2-space-1\);[^}]*padding:\s*var\(--v2-space-1\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-segmented-control button\s*{[^}]*font:\s*var\(--v2-weight-heading-strong\) var\(--v2-text-h6\) \/ var\(--v2-line-h6\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-segmented-control button\s*{[^}]*transition:[^;]*background-color var\(--v2-duration-fast\)/)
    expect(designSystemStyles).toMatch(/\.ds-switch-field__track\s*{[^}]*border:\s*1px solid var\(--v2-border\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-progress-example\s*{[^}]*font:\s*var\(--v2-weight-text\) var\(--v2-text-body\) \/ var\(--v2-line-body\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-progress-example__heading strong\s*{[^}]*font:\s*var\(--v2-weight-heading-strong\) var\(--v2-text-h6\) \/ var\(--v2-line-h6\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-progress-example--compact strong\s*{[^}]*font:\s*var\(--v2-weight-heading-strong\) var\(--v2-text-h6\) \/ var\(--v2-line-h6\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-pagination button:hover\s*{[^}]*box-shadow:\s*var\(--v2-shadow-small\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-pagination button:active\s*{[^}]*box-shadow:\s*none;/)
  })

  test('does not expose a redundant Modal confirmation state control', () => {
    render(<DesignSystemScreen />)
    const specimen = screen.getByRole('heading', { name: 'Modals & tooltips' }).closest('.v2-specimen-card')
    expect(within(specimen).queryByRole('switch', { name: 'Open' })).not.toBeInTheDocument()
    expect(within(specimen).getByRole('button', { name: 'Open confirmation dialog' })).toBeInTheDocument()
  })

  test('removes the Menu and supporting information group', () => {
    render(<DesignSystemScreen />)
    expect(screen.queryByRole('heading', { name: 'Menu and supporting information' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Menu and supporting information' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open asset actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'About motion feedback' })).not.toBeInTheDocument()
    const modals = screen.getByRole('heading', { name: 'Modals & tooltips' }).closest('.v2-specimen-card')
    expect(within(modals).getByRole('button', { name: 'Show success toast' })).toBeInTheDocument()
    expect(within(modals).getByRole('switch', { name: 'Toast visible' })).toBeInTheDocument()
  })

  test('removes the nested focus stroke from the color hex field', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-color-input__hex:focus-visible\s*{[^}]*outline:\s*0 !important;[^}]*box-shadow:\s*none !important;/)
  })

  test('keeps design-system token chips readable', () => {
    expect(designSystemStyles).toMatch(/\.ds-button\.v2-token-chip\s*{[^}]*font-size:\s*11px;/)
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
    expect(within(specimen).getByText('Draft saved in this preview.')).toHaveAttribute('role', 'status')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('supports arrow wrapping, Home, End, and linked panels with roving tab stops', async () => {
    const user = userEvent.setup()
    function TabHarness() {
      const [value, setValue] = useState('Preview')
      return <>
        <PillTabs tabs={['Preview', 'Code']} value={value} onChange={setValue} ariaLabel="Content view" idPrefix="test-content" />
        <PillTabPanel tab="Preview" value={value} idPrefix="test-content">Preview panel</PillTabPanel>
        <PillTabPanel tab="Code" value={value} idPrefix="test-content">Code panel</PillTabPanel>
      </>
    }
    render(<TabHarness />)
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
    const library = screen.getByRole('complementary', { name: 'Library' })
    expect(within(library).getByRole('navigation', { name: 'Library components' })).toBeVisible()
    expect(within(library).getByRole('navigation', { name: 'Design system sections' })).toBeVisible()
    expect(within(library).getByRole('link', { name: 'Basics', exact: true })).not.toHaveAttribute('aria-current')
    for (const name of ['Foundations', 'Actions and controls', 'Navigation', 'Feedback', 'Data display', 'Content objects', 'Overlays', 'Motion', 'Responsive behavior']) {
      expect(screen.getAllByRole('heading', { name }).some((heading) => heading.checkVisibility?.() ?? true)).toBe(true)
    }
    expect(screen.getByText('#79d9ff')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copy Body typography token' })).toBeVisible()
    expect(screen.queryByText('--v2-text-body')).not.toBeInTheDocument()
    expect(screen.queryByText('--v2-line-body')).not.toBeInTheDocument()
    expect(screen.getByText('4px base unit')).toBeVisible()
  })

  test('moves the complete chart collection to UI blocks', () => {
    render(<DesignSystemScreen />)
    expect(document.querySelector('#components-metrics')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Pie chart' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Donut chart' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Polar area chart' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Grouped bar chart' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Area chart' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Token burn by model' })).toBeVisible()
  })

  test('moves Content objects out of Components and into UI blocks', () => {
    try {
      history.replaceState({}, '', '/design-system?section=components')
      const { unmount } = render(<DesignSystemScreen />)
      expect(document.querySelector('#components-content-objects')).not.toBeInTheDocument()
      unmount()

      history.replaceState({}, '', '/design-system?section=ui-blocks')
      render(<DesignSystemScreen />)
      expect(document.querySelector('#ds-content-objects')).toBeVisible()
      expect(screen.getByRole('region', { name: 'Content' })).toHaveTextContent('Content objects')
    } finally {
      history.replaceState({}, '', '/design-system')
    }
  })

  test('removes the Disclosure specimen from the Components catalog', () => {
    render(<DesignSystemScreen />)
    expect(document.querySelector('#components-disclosure')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Disclosure', exact: true })).not.toBeInTheDocument()
  })

  test('renders the Tags group with filled, outline, and status variants', () => {
    history.replaceState({}, '', '/design-system?section=components')
    render(<DesignSystemScreen />)

    const tags = document.querySelector('#components-tags')
    expect(tags).toBeVisible()
    expect(within(tags).getByText('Default')).toHaveClass('ds-tag--filled', 'ds-tag--neutral')
    expect(within(tags).getByText('Paid social')).toHaveClass('ds-tag--filled', 'ds-tag--accent')
    expect(within(tags).queryByText('Draft')).not.toBeInTheDocument()
    expect(within(tags).getByText('Blocked')).toHaveAttribute('data-tone', 'danger')
    expect(tags.querySelector('.v2-tag-grid')).toBeInTheDocument()
    expect(tags.querySelectorAll('.v2-tag-cell')).toHaveLength(2)
    expect(within(tags).queryByText('Version 04')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tags', exact: true })).toHaveAttribute('href', '#components-tags')
    history.replaceState({}, '', '/design-system')
  })

  test('renders Text with inline editing previews across Basics typography styles', () => {
    render(<DesignSystemScreen />)
    const specimen = screen.getByRole('heading', { name: 'Text with inline editing' }).closest('.v2-specimen-card')
    expect(specimen).toBeVisible()
  expect(within(specimen).getAllByRole('button', { name: /^Edit / })).toHaveLength(4)
  expect(within(specimen).getByText('Campaign title')).toBeVisible()
  expect(within(specimen).getByText('Body copy')).toBeVisible()
})

  test('renders Panel inside the standard Components specimen wrapper', () => {
    history.replaceState({}, '', '/design-system?section=components#components-panel')
    render(<DesignSystemScreen />)

    const specimen = document.querySelector('#components-panel')
    expect(specimen).toBeVisible()
    expect(screen.getByRole('link', { name: 'Panel', exact: true })).toHaveAttribute('href', '#components-panel')
    expect(within(specimen).getByRole('region', { name: 'Campaign brief' })).toHaveTextContent('Shared grouping structure for related controls and information.')
    history.replaceState({}, '', '/design-system')
  })

  test('groups native selection controls into dedicated cards instead of Fields', () => {
    history.replaceState({}, '', '/design-system?section=components')
    render(<DesignSystemScreen />)

    const fields = document.querySelector('#components-fields')
    expect(within(fields).queryByRole('radio')).not.toBeInTheDocument()
    expect(within(fields).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(fields.querySelector('form')).queryByRole('switch')).not.toBeInTheDocument()

    for (const name of ['Radiobuttons', 'Checklist', 'Toggles']) {
      const card = document.querySelector(`#components-${name.toLowerCase()}`)
      expect(card).toBeVisible()
      expect(within(card).getByRole('heading', { name })).toBeVisible()
    }
    expect(screen.getByRole('link', { name: 'Radiobuttons', exact: true })).toHaveAttribute('href', '#components-radiobuttons')
    history.replaceState({}, '', '/design-system')
  })

  test('toggles radio option counts from the Radiobuttons variants panel', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const card = document.querySelector('#components-radiobuttons')
    const counts = within(card).getByRole('switch', { name: 'Counts' })
    expect(counts).not.toBeChecked()
    expect(within(card).queryByText('4', { selector: '.ds-radio-group__option-count' })).not.toBeInTheDocument()

    await user.click(counts)
    expect(within(card).getByText('4', { selector: '.ds-radio-group__option-count' })).toBeVisible()
    expect(within(card).getByText('2', { selector: '.ds-radio-group__option-count' })).toBeVisible()
  })

  test('uses one-pixel dropdown strokes and canonical inline confirmation primitives', async () => {
    expect(designSystemStyles).toMatch(/\.v2-select-trigger\s*{[^}]*border:\s*1px solid var\(--v2-border\);/)
    expect(designSystemStyles).toMatch(/\.v2-floating-listbox\s*{[^}]*border:\s*1px solid var\(--v2-border\);/)
    expect(designSystemStyles).toMatch(/\.v2-confirmation-panel strong\s*{[^}]*font:\s*var\(--v2-weight-heading\) var\(--v2-text-small\)\s*\/\s*var\(--v2-line-small\) var\(--v2-font\);/)

    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    await user.click(screen.getByRole('button', { name: 'Open inline confirmation' }))
    const confirmation = screen.getByRole('group', { name: 'Confirm draft deletion' })
    expect(within(confirmation).getByRole('button', { name: 'Keep draft' })).toHaveClass('ds-button', 'ds-button--secondary')
    expect(within(confirmation).getByRole('button', { name: 'Delete draft' })).toHaveClass('ds-button', 'ds-button--danger')
  })

  test('links the separate sidebar to preview metadata and filters across all groups', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)
    const library = screen.getByRole('complementary', { name: 'Library' })
    expect(library.closest('.system-screen--v2')).toBeNull()
    for (const name of ['Basics', 'Components', 'UI blocks']) {
      expect(within(library).getByRole('link', { name, exact: true })).toBeVisible()
    }
    expect(library.querySelectorAll('details, summary')).toHaveLength(0)
    const links = [...library.querySelectorAll('.ds-tree-item')]
    expect(links).toHaveLength(29)
    for (const link of links) {
      const target = document.querySelector(link.getAttribute('href'))
      expect(target).toBeVisible()
      const reference = within(target).queryByText(/^Reference/)
      if (reference) {
        expect(reference).toBeVisible()
        expect(target.querySelector('details')).not.toHaveAttribute('open')
        await user.click(target.querySelector('summary'))
        expect(target).toHaveTextContent('src/')
        await user.click(target.querySelector('summary'))
      }
    }
    const buttonLink = within(library).getByRole('link', { name: 'App Button', exact: true })
    const preview = document.querySelector(buttonLink.getAttribute('href')).closest('.v2-specimen-card')
    expect(within(preview).getByRole('heading', { name: 'Buttons' })).toBeVisible()
    expect(within(preview).getByRole('button', { name: 'Create campaign' })).toBeVisible()
    expect(within(preview).queryByText('Constraints')).not.toBeInTheDocument()
    await user.click(buttonLink)
    expect(buttonLink).toHaveAttribute('aria-current', 'location')
    const search = within(library).getByRole('searchbox', { hidden: true })
    await user.type(search, 'PromptComposer')
    expect(within(library).getAllByRole('link', { name: /./ })).toHaveLength(6)
    expect(within(library).getByRole('link', { name: 'Prompt Composer' })).toBeVisible()
    await user.clear(search)
    await user.type(search, 'no-such-component')
    expect(within(library).queryAllByRole('link', { name: /./ })).toHaveLength(5)
    await user.clear(search)
    expect(library.querySelectorAll('.ds-tree-item')).toHaveLength(29)
  })

  test('keeps the documented 48px page role at every breakpoint', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-type-sample--h1 p\s*{[^}]*font-size:\s*var\(--v2-text-h1\);/)
    expect(designSystemStyles).not.toMatch(/\.system-screen--v2 \.(?:v2-page-header h1|v2-type-sample--h1 p)\s*{[^}]*font-size:\s*40px;/)
  })

  test('fills range tracks from the left edge and allows date fields to shrink', () => {
    expect(designSystemStyles).toMatch(/\.v2-date-range\s*{[^}]*min-width:\s*0;/)
    expect(designSystemStyles).toMatch(/input\[type="range"\]::-webkit-slider-runnable-track\s*{[^}]*linear-gradient\(/)
    expect(designSystemStyles).toContain('var(--v2-range-progress, 0%)')
  })

  test('gives every custom dropdown the shared raised menu treatment', () => {
    expect(designSystemStyles).toMatch(/\.v2-floating-listbox\s*{[^}]*border:\s*1px solid var\(--v2-border\);[^}]*box-shadow:\s*8px 8px 0 var\(--v2-ink\);/)
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

  test('matches dropdown autocomplete disabled styling to other inputs', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-input-shell:has\(input:disabled\)\s*{[^}]*background:\s*var\(--v2-canvas\);[^}]*color:\s*var\(--v2-text-secondary\);[^}]*cursor:\s*not-allowed;/)
  })

  test('uses the Basics accent for info feedback and Basics typography for validation errors', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-toast--info\s*{[^}]*border-left-color:\s*var\(--v2-accent\);[^}]*color:\s*var\(--v2-accent\);/)
    expect(designSystemStyles).toMatch(/\.ds-field__error\s*{[^}]*font:\s*var\(--v2-weight-heading\) var\(--v2-text-meta\)\s*\/\s*var\(--v2-line-small\) var\(--v2-font\);/)
  })

  test('uses one Basics caption style across field labels and upload captions', () => {
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-field label,[\s\S]*\.v2-demo-label\s*{[^}]*font:\s*var\(--v2-weight-heading\) var\(--v2-text-meta\)\s*\/\s*var\(--v2-line-small\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-control-label,[\s\S]*\.v2-control-block legend\s*{[^}]*font:\s*var\(--v2-weight-heading\) var\(--v2-text-meta\)\s*\/\s*var\(--v2-line-small\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.ds-field__label\s*{[^}]*font:\s*var\(--v2-weight-heading\) var\(--v2-text-meta\)\s*\/\s*var\(--v2-line-small\) var\(--v2-font\);/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-file-drop strong\s*{[^}]*font:\s*var\(--v2-weight-heading\) var\(--v2-text-meta\)\s*\/\s*var\(--v2-line-small\) var\(--v2-font\);/)
  })

  test('gives every clickable surface a shared hover and press baseline', () => {
    expect(designSystemStyles).toMatch(/:where\(button, a, summary, input\[type="checkbox"\], input\[type="radio"\], input\[type="color"\], input\[type="range"\]\)/)
    expect(designSystemStyles).toMatch(/:not\(:disabled\):hover\s*{[^}]*filter:\s*brightness\(0\.96\);/)
    expect(designSystemStyles).toMatch(/:not\(:disabled\):active\s*{[^}]*transform:\s*translateY\(1px\) scale\(0\.99\);/)
  })

  test('highlights data table rows on hover without changing their layout', () => {
    expect(designSystemStyles).toMatch(/\.v2-data-table tbody tr:hover > \*\s*{[^}]*background:\s*color-mix\(/)
    expect(designSystemStyles).not.toMatch(/\.v2-data-table tbody tr:hover > \*\s*{[^}]*box-shadow:/)
  })

  test('keeps foundations focused on shared color, type, and spacing', () => {
    render(<DesignSystemScreen />)
    expect(screen.getByRole('heading', { name: 'Color' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Typography' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Spacing' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Shape' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Borders' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Icon sizes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Motion timing' })).not.toBeInTheDocument()
  })

  test('keeps segmented-control focus outlines outside unclipped children', () => {
    expect(designSystemStyles).not.toMatch(
      /\.system-screen--v2 \.v2-segmented-control\s*{[^}]*overflow:\s*hidden;/,
    )
  })

  test('demonstrates interactive control and navigation states', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    await user.click(screen.getByRole('checkbox', { name: 'Include animated formats' }))
    expect(screen.getByRole('checkbox', { name: 'Include animated formats' })).toBeChecked()
    expect(screen.getByText('Add a campaign objective')).toHaveRole('alert')
    expect(screen.queryByRole('button', { name: 'Validate brief' })).not.toBeInTheDocument()
  })

  test('shows feedback, data, and the campaign production object pattern', () => {
    render(<DesignSystemScreen />)
    expect(screen.getByRole('table', { name: 'Campaign performance' })).toBeVisible()
    expect(screen.getByText('Campaign card')).toBeVisible()
    expect(screen.queryByText('Prompt card')).not.toBeInTheDocument()
    expect(screen.queryByText('Review required')).not.toBeInTheDocument()
  })

  test('uses truthful noninteractive semantics for inert production objects', () => {
    render(<DesignSystemScreen />)
    const contentObjects = document.querySelector('#ds-content-objects')
    expect(contentObjects).toBeInTheDocument()

    const objects = within(contentObjects).getAllByRole('article')
    expect(objects).toHaveLength(1)
    expect(objects[0]).toHaveAccessibleName('Campaign card')
    expect(objects[0]).not.toHaveAttribute('tabindex')
    expect(within(objects[0]).queryAllByRole('button')).toHaveLength(0)
  })

  test('does not include secondary production object thumbnails', () => {
    render(<DesignSystemScreen />)
    expect(screen.queryByRole('img', { name: 'Generated asset thumbnail' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Assembled banner thumbnail' })).not.toBeInTheDocument()
  })

  test('uses the canonical Tag treatment for danger status text', () => {
    expect(designSystemStyles).toMatch(
      /\.ds-tag--filled\.ds-tag--danger\s*{[^}]*color:\s*var\(--v2-danger\);/,
    )
  })

  test('uses canonical Tags for status labels and selected filters', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const dataDisplay = document.querySelector('#components-table')
    expect(within(dataDisplay).getByText('Generating', { selector: '.ds-tag' })).toHaveClass('ds-tag--filled', 'ds-tag--warning')

    const channelTrigger = screen.getByRole('button', { name: 'Open channel options' })
    await user.click(channelTrigger)
    await user.click(within(screen.getByRole('listbox', { name: 'Channel options' })).getByRole('option', { name: 'Email' }))
    expect(screen.getByText('Email', { selector: '.v2-selection-chip' })).toHaveClass('ds-tag', 'ds-tag-button', 'ds-tag--accent')
  })

  test('shows feedback toast variants with the shared heading typography', () => {
    render(<DesignSystemScreen />)
    expect(screen.getByText('Campaign saved')).toBeInTheDocument()
    expect(screen.getByText('Export delayed')).toBeInTheDocument()
    expect(screen.getByText('Brief needs attention')).toBeInTheDocument()
    expect(screen.getByText('Draft autosaved')).toBeInTheDocument()
    expect(designSystemStyles).toMatch(/\.v2-toast strong\s*{[^}]*font:\s*var\(--v2-weight-heading\) var\(--v2-text-h7\)\s*\/\s*var\(--v2-line-h7\) var\(--v2-font\)/)
    expect(designSystemStyles).toMatch(/\.v2-toast--error\s*{[^}]*border-left-color:\s*var\(--v2-danger\)/)
    expect(designSystemStyles).toMatch(/\.v2-toast--warning\s*{[^}]*border-left-color:\s*var\(--v2-warning-border\)/)
    expect(designSystemStyles).toMatch(/\.v2-toast--info\s*{[^}]*border-left-color:\s*var\(--v2-accent\)/)
    expect(designSystemStyles).toMatch(/\.system-screen--v2 \.v2-alert,\s*\.system-screen--v2 \.v2-empty-state,\s*\.system-screen--v2 \.v2-toast\s*{[^}]*height:\s*auto;/)
    expect(designSystemStyles).not.toMatch(/\.system-screen--v2 \.v2-toast\s*{[^}]*min-height:\s*88px;/)
  })

  test('removes the Status language catalog specimen', () => {
    render(<DesignSystemScreen />)
    expect(screen.queryByRole('heading', { name: 'Status language' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Status language' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Feedback states' })).toBeVisible()
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

  test('exposes confirmation and toast actions without hover', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    await user.click(screen.getByRole('button', { name: 'Open inline confirmation' }))
    const confirmation = screen.getByRole('group', { name: 'Confirm draft deletion' })
    expect(within(confirmation).getByText('Delete campaign draft?')).toBeVisible()
    await user.click(within(confirmation).getByRole('button', { name: 'Keep draft' }))
    expect(screen.queryByRole('group', { name: 'Confirm draft deletion' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show success toast' }))
    const toast = screen.getByRole('status', { name: 'Motion preference saved' })
    expect(toast).toBeVisible()
    await user.click(within(toast).getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByRole('status', { name: 'Motion preference saved' })).not.toBeInTheDocument()
  })

  test('keeps open modal surfaces flat until an interaction supplies elevation', () => {
    const modalRule = designSystemStyles.match(
      /\.system-screen--v2 \.v2-modal\s*{([^}]*)}/,
    )?.[1]

    expect(modalRule).toBeDefined()
    expect(modalRule).not.toMatch(/box-shadow:/)
  })

  test('sizes dropdown list options with the shared compact control token', () => {
    expect(designSystemStyles).toMatch(
      /\.system-screen--v2 \.v2-listbox-option\s*{[^}]*min-height:\s*var\(--v2-control-height-compact\);/,
    )
  })

  test('binds motion specimens to the timing and reduced-motion contract', () => {
    render(<DesignSystemScreen />)

    expect(screen.getByRole('button', { name: 'Preview button lift' })).toHaveClass('ds-button')
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
      /\.system-screen--v2 \.ds-button[^}]*\.system-screen--v2 \.v2-motion-card[^}]*{[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/,
    )
    expect(designSystemStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.system-screen--v2 \.v2-motion-card:hover\s*{[^}]*border-color:\s*var\(--v2-accent\);/,
    )
  })

  test('presents the expanded picker, slider, and progress catalog with truthful semantics', () => {
    render(<DesignSystemScreen />)

    expect(screen.getByRole('heading', { name: 'Foundations' }).closest('.v2-section')).toHaveClass('v2-section--foundations')
    expect(designSystemStyles).toMatch(/\.v2-section--foundations\s*{[^}]*border:\s*0;[^}]*background:\s*transparent;/)
    expect(screen.getByRole('searchbox', { name: 'Search campaigns' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Campaign start' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByLabelText('Campaign end')).not.toBeInTheDocument()
    expect(designSystemStyles).toMatch(/\.v2-stepper input\s*{[^}]*text-align:\s*center;/)
    expect(designSystemStyles).toMatch(/\.v2-stepper input::-webkit-inner-spin-button/)
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

  test('uses the elevated custom menu pattern for the primary channel field', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const trigger = screen.getByRole('button', { name: 'Primary channel: Paid social' })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Primary channel' })
    expect(listbox).toHaveClass('v2-floating-listbox')
    expect(within(listbox).getByRole('option', { name: 'Paid social' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(within(listbox).getByRole('option', { name: 'Email' }))
    expect(screen.getByRole('button', { name: 'Primary channel: Email' })).toBeVisible()
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

  test('updates multiselect, stepper, rating, and slider controls', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

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
    expect(screen.queryByText('3 of 5', { selector: 'output' })).not.toBeInTheDocument()

    const intensity = screen.getByRole('slider', { name: 'Campaign intensity' })
    fireEvent.change(intensity, { target: { value: '61' } })
    expect(intensity).toHaveValue('61')
    expect(screen.getByText('61%', { selector: 'output' })).toBeVisible()
  })

  test('closes the channel listbox on Escape and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const trigger = screen.getByRole('button', { name: 'Open channel options' })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Channel options' })
    const firstOption = within(listbox).getAllByRole('option')[0]
    firstOption.focus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: 'Channel options' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('closes the channel listbox when clicking outside the control', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    await user.click(screen.getByRole('button', { name: 'Open channel options' }))
    expect(screen.getByRole('listbox', { name: 'Channel options' })).toBeVisible()
    await user.click(screen.getByRole('heading', { name: 'Dropdowns' }))

    expect(screen.queryByRole('listbox', { name: 'Channel options' })).not.toBeInTheDocument()
  })

  test('supports per-option icons in all dropdown controls with one shared toggle', async () => {
    const user = userEvent.setup()
    render(<DesignSystemScreen />)

    const stateGroup = screen.getByRole('group', { name: 'Dropdowns states' })
    const iconSwitch = within(stateGroup).getByRole('switch', { name: 'Option icons' })
    expect(iconSwitch).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Primary channel: Paid social' }))
    expect(within(screen.getByRole('listbox', { name: 'Primary channel' })).getAllByRole('option')[0].querySelectorAll('svg')).toHaveLength(2)
    await user.keyboard('{Escape}')

    await user.click(iconSwitch)
    await user.click(screen.getByRole('button', { name: 'Primary channel: Paid social' }))
    expect(within(screen.getByRole('listbox', { name: 'Primary channel' })).getAllByRole('option')[0].querySelectorAll('svg')).toHaveLength(1)
  })

  test('places the market autocomplete in the Fields group', () => {
    render(<DesignSystemScreen />)

    const market = screen.getByRole('combobox', { name: 'Find a market' })
    expect(market.closest('[id^="components-fields"]')).toBeTruthy()
    expect(market.closest('[id^="components-dropdowns"]')).toBeNull()
  })

  test('keeps ScrollArea neutral while revealing its scrollbar on interaction', () => {
    expect(designSystemStyles).toMatch(/\.ds-scroll-area\s*{[^}]*background:\s*transparent;/)
    expect(designSystemStyles).toMatch(/\.ds-scroll-area::-webkit-scrollbar-thumb\s*{[^}]*background:\s*transparent;/)
    expect(designSystemStyles).toMatch(/\.ds-scroll-area:is\(:hover, :focus-visible\)::-webkit-scrollbar-thumb\s*{[^}]*background:\s*var\(--v2-border\)/)
  })

  test('defines hover and press feedback for every interactive control family', () => {
    for (const selector of [
      '.ds-button:not(:disabled):hover',
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
