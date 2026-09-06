import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createCampaignRuntime } from './campaignRuntime.js'
import { useCampaignModule } from './useCampaignModule.js'
import { makeScenario } from './testing/workspaceFixtures.js'
import { useState } from 'react'

test('a sibling refresh keeps a mounted editor draft and its dirty ownership', async () => {
  const scenario = makeScenario('composed')
  let server = structuredClone(scenario.workspace)
  const runtime = createCampaignRuntime({ ...scenario, api: { getWorkspace: async () => server } })
  function Editor() {
    const port = useCampaignModule(runtime, 'banners')
    const [draft, setDraft] = useState(port.input.composition.slotValues.headline)
    return <textarea aria-label="Draft" value={draft} onChange={event => {
      setDraft(event.target.value); port.setDirty(true)
    }} />
  }
  const view = render(<Editor />)
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Keep my draft' } })
  server.campaign.title = 'Renamed'
  server.campaign.revision += 1
  await act(() => runtime.refresh())
  expect(screen.getByLabelText('Draft')).toHaveValue('Keep my draft')
  expect(runtime.hasDirty()).toBe(true)
  view.unmount(); runtime.dispose()
})

test('the subscribed module receives a changed source without affecting other subscribers', async () => {
  const scenario = makeScenario('composed')
  const server = structuredClone(scenario.workspace)
  const runtime = createCampaignRuntime({ ...scenario, api: { getWorkspace: async () => server } })
  let briefRenders = 0
  function Brief() {
    const port = useCampaignModule(runtime, 'brief')
    briefRenders += 1
    return <span>{port.input.brief.notes}</span>
  }
  function Banners() {
    const port = useCampaignModule(runtime, 'banners')
    return <span>{port.input.composition.slotValues.headline}</span>
  }
  const view = render(<><Brief /><Banners /></>)
  const before = briefRenders
  server.composition.slotValues.headline = 'A revised saved headline'
  server.campaign.revision += 1
  await act(() => runtime.refresh())
  expect(screen.getByText('A revised saved headline')).toBeVisible()
  expect(briefRenders).toBe(before)
  view.unmount(); runtime.dispose()
})
