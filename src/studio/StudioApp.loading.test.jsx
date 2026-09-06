import { beforeEach, expect, test, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

test('loading StudioApp does not load the template preview route', async () => {
  let templateRouteLoads = 0
  vi.doMock('./TemplateLibrary.jsx', () => {
    templateRouteLoads += 1
    return { TemplateLibrary: () => null }
  })

  await import('./StudioApp.jsx')

  expect(templateRouteLoads).toBe(0)
})
