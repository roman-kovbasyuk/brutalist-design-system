import { act, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useExitPresence } from './useExitPresence.js'

function List({ items }) {
  return useExitPresence(items).map(({ item, exiting }) => <div key={item.id} data-testid={item.id} aria-hidden={exiting}>{item.title}</div>)
}
test('reduced motion releases removed items without an animation wait', () => {
  const previous = window.matchMedia
  window.matchMedia = () => ({ matches: true })
  vi.useFakeTimers()
  try {
    const view = render(<List items={[{ id: 'a', title: 'First' }]} />)
    view.rerender(<List items={[]} />)
    act(() => vi.advanceTimersByTime(0))
    expect(screen.queryByTestId('a')).not.toBeInTheDocument()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally { window.matchMedia = previous; vi.useRealTimers() }
})
test('retains a removed item briefly in its original position, then releases it', () => {
  vi.useFakeTimers()
  try {
    const items = [{ id: 'a', title: 'First' }, { id: 'b', title: 'Second' }]
    const view = render(<List items={items} />)
    view.rerender(<List items={[items[1], { id: 'c', title: 'Third' }]} />)
    expect(screen.getByTestId('a')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByTestId(/a|b|c/).map(el => el.textContent)).toEqual(['First', 'Second', 'Third'])
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByTestId('a')).not.toBeInTheDocument()
    expect(screen.getByTestId('b')).toHaveTextContent('Second')
  } finally { vi.useRealTimers() }
})
