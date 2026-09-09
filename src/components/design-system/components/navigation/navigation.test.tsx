import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Breadcrumbs } from './Breadcrumbs'
import { Pagination } from './Pagination'
import { SegmentedControl } from './SegmentedControl'
import { Stepper } from './Stepper'
import { Tabs } from './Tabs'

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
