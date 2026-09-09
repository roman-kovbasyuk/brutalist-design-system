import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Container } from './Container'
import { Divider } from './Divider'
import { Grid } from './Grid'
import { Inline } from './Inline'
import { ScrollArea } from './ScrollArea'
import { Stack } from './Stack'
import { Surface } from './Surface'

test('keeps Stack children in their document order while applying its selected gap', () => {
  render(<Stack gap={6}><span>First</span><span>Second</span></Stack>)

  const stack = screen.getByText('First').parentElement
  expect(stack).toHaveClass('ds-stack')
  expect(stack).toHaveStyle({ '--ds-gap': 'var(--v2-space-6)' })
  expect(stack?.textContent).toBe('FirstSecond')
})

test('lets Inline wrap a sequence of related controls', () => {
  render(<Inline gap={2}><button>Previous</button><button>Next</button></Inline>)

  const inline = screen.getByRole('button', { name: 'Previous' }).parentElement
  expect(inline).toHaveClass('ds-inline')
  expect(inline).toHaveStyle({ '--ds-gap': 'var(--v2-space-2)' })
})

test('sizes Grid items through the supplied minimum width without changing item order', () => {
  render(<Grid minItemWidth={360}><span>One</span><span>Two</span></Grid>)

  const grid = screen.getByText('One').parentElement
  expect(grid).toHaveClass('ds-grid')
  expect(grid).toHaveStyle({ '--ds-grid-min': '360px' })
  expect(grid?.textContent).toBe('OneTwo')
})

test('uses a maximum width on Container without discarding native attributes', () => {
  render(<Container maxWidth={960} aria-label="Examples">Content</Container>)

  expect(screen.getByLabelText('Examples')).toHaveStyle({ '--ds-container-max': '960px' })
})

test('renders Surface with its semantic tone and native content', () => {
  render(<Surface tone="canvas" data-testid="surface">Reference panel</Surface>)

  expect(screen.getByTestId('surface')).toHaveClass('ds-surface--canvas')
  expect(screen.getByTestId('surface')).toHaveTextContent('Reference panel')
})

test('renders Divider as a native separator', () => {
  render(<Divider aria-label="Section boundary" />)

  expect(screen.getByRole('separator', { name: 'Section boundary' }).tagName).toBe('HR')
})

test('names the scrollable region and keeps it keyboard-focusable', () => {
  render(<ScrollArea label="Results"><p>Item one</p></ScrollArea>)

  const region = screen.getByRole('region', { name: 'Results' })
  expect(region).toHaveTextContent('Item one')
  expect(region).toHaveAttribute('tabindex', '0')
})
