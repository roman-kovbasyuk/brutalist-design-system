import { describe, expect, test } from 'vitest'
import { isModulePlaygroundRoute, parseModulePlaygroundRoute } from './modulePlaygroundRoute.js'

describe('module playground route', () => {
  test('parses module and scenario by URL semantics', () => {
    expect(parseModulePlaygroundRoute(new URL('https://studio.test/mvp/dev/modules/visuals?scenario=visuals-ready')))
      .toEqual({ moduleId: 'visuals', scenario: 'visuals-ready' })
  })

  test('uses safe defaults for missing or invalid selections', () => {
    expect(parseModulePlaygroundRoute(new URL('https://studio.test/mvp/dev/modules')))
      .toEqual({ moduleId: 'brief', scenario: 'draft' })
    expect(parseModulePlaygroundRoute(new URL('https://studio.test/mvp/dev/modules/not-real?scenario=nope')))
      .toEqual({ moduleId: 'brief', scenario: 'draft' })
  })

  test('does not claim ordinary application routes', () => {
    expect(parseModulePlaygroundRoute(new URL('https://studio.test/mvp/campaigns/campaign-1'))).toBeNull()
  })

  test('excludes the playground route when development mode is disabled', () => {
    const url = new URL('https://studio.test/mvp/dev/modules/review?scenario=ready')
    expect(isModulePlaygroundRoute(url, false)).toBe(false)
    expect(isModulePlaygroundRoute(url, true)).toBe(true)
  })
})
