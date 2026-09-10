import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { UIBlocks } from './UIBlocks.jsx'

const componentCopy = reference => `Use this component ${reference} from the app design system (brutalist design system)`

test('exposes several individually copyable options in each chart family', () => {
  render(<UIBlocks />)
  for (const [name, count] of [['Pie charts', 4], ['Charts', 6], ['Token burn', 2], ['Metric widgets', 4]]) {
    const group = screen.getByRole('region', { name })
    expect(within(group).getAllByRole('button', { name: /^Copy .* UI block$/ })).toHaveLength(count)
  }
  expect(screen.queryByRole('button', { name: 'Copy Chart dashboard UI block' })).not.toBeInTheDocument()
})

test('block surface tracks the pointer, copies, and preserves embedded controls', async () => {
  const user = userEvent.setup()
  render(<UIBlocks />)
  const cell = screen.getByRole('button', { name: 'Copy Prompt input UI block' }).closest('article')
  await user.pointer({ target: cell, coords: { clientX: 300, clientY: 220 } })
  expect(screen.getByText(componentCopy('PromptInputBlock'))).toBeVisible()
  expect(screen.getByText(componentCopy('PromptInputBlock')).style.getPropertyValue('--copy-x')).toBe('300px')
  await user.pointer({ target: cell, coords: { clientX: 420, clientY: 260 } })
  expect(screen.getByText(componentCopy('PromptInputBlock')).style.getPropertyValue('--copy-x')).toBe('420px')
  await user.click(cell)
  expect(await navigator.clipboard.readText()).toBe(componentCopy('PromptInputBlock'))
  expect(screen.getByText('Copied')).toBeVisible()
  await user.type(within(cell).getByRole('textbox'), 'A prompt')
  expect(within(cell).getByRole('textbox')).toHaveValue('A prompt')
  expect(screen.queryByText('Copied')).not.toBeInTheDocument()
})

test.each([['Scheduling', 'SchedulingBlock'], ['Settings form', 'SettingsBlock'], ['Donut', 'PieChart variant="donut"'], ['Grouped bar chart', 'BarChart variant="grouped"'], ['Capacity gauge', 'GaugeWidget']])('copies the implementation name for %s', async (name, reference) => {
  const user = userEvent.setup()
  render(<UIBlocks />)
  const target = screen.getByRole('button', { name: `Copy ${name} UI block` })
  await user.hover(target)
  expect(screen.getByText(componentCopy(reference))).toBeVisible()
  await user.click(target)
  expect(await navigator.clipboard.readText()).toBe(componentCopy(reference))
})
