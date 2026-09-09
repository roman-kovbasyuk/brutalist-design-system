import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { ExampleDetails } from './ExampleDetails'
import type { Entry, Example } from '../registry/types'

const example: Example = {
  id: 'primary', title: 'Primary button', group: 'Emphasis', defaults: { variant: 'primary', rounded: false }, initialDraft: { label: 'Save' },
  controls: [
    { key: 'variant', label: 'Variant', type: 'select', choices: ['primary', 'danger'], shareable: true },
    { key: 'rounded', label: 'Rounded', type: 'boolean', shareable: true },
    { key: 'label', label: 'Button label', type: 'text', maxLength: 12, shareable: false },
  ],
  Component: () => null,
  getSource: (options) => `export function Example() { return <button>${options.label}</button> }`,
}

const entry: Entry = {
  id: 'app-button', familyId: 'buttons', name: 'AppButton', purpose: 'Starts a saved action.', maturity: 'beta', source: 'src/components/design-system/components/actions/AppButton.tsx', exports: ['AppButton'], dependencies: [], tokens: [], usage: 'Use for an application action.', keyboard: 'Enter activates it.', constraints: [], examples: [example],
}

describe('ExampleDetails', () => {
  test('validates controls, changes view, and resets through labelled panels', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    const onDraftChange = vi.fn()
    const onReset = vi.fn()
    render(<ExampleDetails entry={entry} example={example} options={{ variant: 'primary', rounded: false }} draft={{ label: 'Save' }} view="options" onViewChange={vi.fn()} onOptionsChange={onOptionsChange} onDraftChange={onDraftChange} onReset={onReset} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Variant' }), 'danger')
    expect(onOptionsChange).toHaveBeenCalledWith({ variant: 'danger' })
    await user.click(screen.getByRole('switch', { name: 'Rounded' }))
    expect(onOptionsChange).toHaveBeenCalledWith({ rounded: true })
    await user.clear(screen.getByRole('textbox', { name: 'Button label' }))
    await user.type(screen.getByRole('textbox', { name: 'Button label' }), 'Publish')
    expect(onDraftChange).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reset Primary button' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  test('renders deterministic code and usage in separate real tab panels', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()
    render(<ExampleDetails entry={entry} example={example} options={{ variant: 'primary', rounded: false, label: 'Save' }} draft={{ label: 'Save' }} view="code" onViewChange={onViewChange} onOptionsChange={vi.fn()} onDraftChange={vi.fn()} onReset={vi.fn()} />)

    expect(screen.getByRole('tabpanel', { name: 'Code' })).toHaveTextContent('export function Example()')
    await user.click(screen.getByRole('tab', { name: 'How to use' }))
    expect(onViewChange).toHaveBeenCalledWith('usage')
  })
})
