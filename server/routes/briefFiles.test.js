import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'

const payload = { name: 'brief.txt', mimeType: 'text/plain', data: Buffer.from('Autumn launch').toString('base64') }

function makeApp(role = 'marketer') {
  return buildApp({
    resolveActor: vi.fn(async () => role ? { id: `${role}-1`, role, disabled: false } : null),
    workflowService: {},
  })
}

describe('brief file extraction route', () => {
  test('extracts supported text for campaign editors', async () => {
    const app = makeApp()
    const response = await app.inject({ method: 'POST', url: '/api/v1/brief-files/extract', payload })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ text: 'Autumn launch', requestId: response.headers['x-request-id'] })
    await app.close()
  })

  test.each([['designer', 403], [null, 401]])('rejects %s access before extraction', async (role, statusCode) => {
    const app = makeApp(role)
    const response = await app.inject({ method: 'POST', url: '/api/v1/brief-files/extract', payload })
    expect(response.statusCode).toBe(statusCode)
    await app.close()
  })

  test('returns safe errors for malformed and unsupported requests', async () => {
    const app = makeApp()
    const malformed = await app.inject({ method: 'POST', url: '/api/v1/brief-files/extract', payload: { ...payload, data: '%%%' } })
    const unsupported = await app.inject({ method: 'POST', url: '/api/v1/brief-files/extract', payload: { ...payload, name: 'brief.rtf', mimeType: 'application/rtf' } })
    expect(malformed.json()).toMatchObject({ code: 'invalid_brief_file' })
    expect(unsupported).toMatchObject({ statusCode: 415 })
    expect(unsupported.body).not.toMatch(/stack|node_modules/i)
    await app.close()
  })

  test('accepts a supported decoded file above the framework default body limit', async () => {
    const app = makeApp()
    const text = `${' '.repeat(1024 * 1024)}Autumn launch`
    const response = await app.inject({
      method: 'POST', url: '/api/v1/brief-files/extract',
      payload: { ...payload, data: Buffer.from(text).toString('base64') },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().text).toBe('Autumn launch')
    await app.close()
  })
})
