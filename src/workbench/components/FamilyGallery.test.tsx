import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { FamilyGallery } from './FamilyGallery'
import type { Entry, ExampleProps, Family } from '../registry/types'

const family: Family = {
  id: 'buttons',
  section: 'components',
  title: 'Buttons',
  layout: 'grid',
  groups: ['Emphasis', 'States'],
}

function ButtonPreview({ options, draft }: ExampleProps) {
  return <button type="button">{`${options.variant}:${draft.variant ?? 'default'}`}</button>
}

const entry: Entry = {
  id: 'app-button',
  familyId: 'buttons',
  name: 'AppButton',
  purpose: 'Starts an application action.',
  maturity: 'beta',
  source: 'src/components/design-system/components/actions/AppButton.tsx',
  exports: ['AppButton'],
  dependencies: [],
  tokens: [],
  usage: 'Use for an action.',
  keyboard: 'Enter activates it.',
  constraints: [],
  examples: [
    {
      id: 'primary',
      title: 'Primary',
      group: 'Emphasis',
      defaults: { variant: 'primary' },
      initialDraft: {},
      controls: [{ key: 'variant', label: 'Variant', type: 'select', choices: ['primary', 'danger'], shareable: true }],
      Component: ButtonPreview,
    },
    {
      id: 'disabled',
      title: 'Disabled',
      group: 'States',
      defaults: {},
      initialDraft: {},
      controls: [],
      Component: ButtonPreview,
    },
  ],
}

describe('FamilyGallery', () => {
  test('keeps related examples together under their family groups', () => {
    render(<FamilyGallery family={family} entries={[entry]} />)

    expect(screen.getByRole('region', { name: 'Buttons examples' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Emphasis' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'States' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'primary:default' })).toBeInTheDocument()
  })

  test('keeps browsing focused on a specimen and its component identifier', () => {
    render(<FamilyGallery family={family} entries={[entry]} />)

    expect(screen.getAllByText('app-button')).toHaveLength(2)
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /code for/i })).not.toBeInTheDocument()
  })
})
