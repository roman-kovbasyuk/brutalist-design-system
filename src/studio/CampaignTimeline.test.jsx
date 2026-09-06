import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { CampaignTimeline } from './CampaignTimeline.jsx'

const items = [
  { label: 'Brief', href: '#brief', current: true, complete: false, disabled: false },
  { label: 'Copy', href: '#copy', current: false, complete: false, disabled: false },
]

test('commits the collapsed mobile timeline before navigation measures its target', () => {
  const onChange = vi.fn(() => {
    expect(screen.getByLabelText('Campaign progress')).toHaveAttribute('data-expanded', 'false')
  })
  render(<CampaignTimeline items={items} activeModule="brief" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: /Step 1 of 2/ }))
  expect(screen.getByLabelText('Campaign progress')).toHaveAttribute('data-expanded', 'true')
  fireEvent.click(screen.getByRole('link', { name: 'Copy' }))
  expect(onChange).toHaveBeenCalledWith(1)
})
