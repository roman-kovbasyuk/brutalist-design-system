import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { StepRail } from '../components/StepRail.jsx'
import { CampaignOverview } from './CampaignOverview.jsx'
import { VisualStage } from './VisualStage.jsx'
import { stages } from './workflow.js'

describe('campaign layout', () => {
  test('adapts the existing rail without skipping MVP steps or unlocking future stages', () => {
    const onStepChange = vi.fn()
    render(<StepRail items={stages.map(label => [label])} hiddenSteps={[]} currentStep={2} maxStep={3} onStepChange={onStepChange} scrollOnChange={false} />)
    const buttons = within(screen.getByRole('navigation')).getAllByRole('button')
    expect(buttons).toHaveLength(8)
    expect(buttons[1]).toHaveAttribute('aria-current', 'step')
    expect(buttons[4]).toHaveTextContent('Review file')
    expect(buttons[3]).toBeDisabled()
    fireEvent.click(buttons[2])
    expect(onStepChange).toHaveBeenCalledWith(3)
  })
  test('shows saved facts and labels missing information without guessing', () => {
    render(<CampaignOverview workspace={{ campaign: { brief: { audience: 'Commuters', objective: 'Product launch', offer: '20% off', notes: 'A quieter commute.' } }, jobs: [{ step: 'brief_analysis', status: 'succeeded', result: { analysis: { summary: 'Launch headphones for daily travel.' } } }] }} />)
    expect(screen.getByText('Commuters')).toBeInTheDocument()
    expect(screen.getByText('20% off')).toBeInTheDocument()
    expect(screen.getAllByText('Not specified')).toHaveLength(2)
    expect(screen.getByText('Launch headphones for daily travel.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Campaign summary' })).not.toBeInTheDocument()
  })
  test('labels original notes as brief when no analysis exists', () => {
    render(<CampaignOverview workspace={{ campaign: { brief: { notes: 'Original campaign text.' } }, jobs: [] }} />)
    expect(screen.getByText('Original campaign text.')).toBeInTheDocument()
  })
  test('keeps the image-generation action inside each direction placeholder', () => {
    const onImage = vi.fn()
    render(<VisualStage workspace={{ campaign: {}, directions: [{ id: 'd1', title: 'Nordic focus', prompt: 'Soft daylight', previewAssetId: null }] }} onImage={onImage} />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Nordic focus image' })).getByRole('button', { name: 'Generate image' }))
    expect(onImage).toHaveBeenCalledWith('d1')
  })
  test.each([{ readOnly: true }, { pending: 'Generate image 1' }])('blocks placeholder generation when editing is unavailable: %j', props => {
    render(<VisualStage workspace={{ campaign: {}, directions: [{ id: 'd1', title: 'Nordic focus', prompt: 'Soft daylight' }] }} {...props} />)
    expect(screen.getByRole('button', { name: 'Generate image' })).toBeDisabled()
  })
})
