import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'

const campaign = { id: 'campaign-1', title: 'Studio', brief: { product: 'Studio', audience: 'Designers', objective: 'Trial', offer: '', locale: 'en', notes: '' }, status: 'draft', revision: 2, selectedCopyId: null, selectedDirectionId: null, compositionId: null, currentVersionNumber: 0, openVersionId: null, createdBy: 'm1', createdAt: new Date(), updatedAt: new Date(), archivedAt: null }
const workspace = { campaign, copies: [], directions: [], composition: null, versions: [], jobs: [], delivery: null }

describe('workspace read route', () => {
  test('requires an authenticated actor before accessing persistence', async () => {
    const getWorkspace = vi.fn()
    const app = buildApp({ resolveActor: async () => null, workflowService: {}, workspaceService: { getWorkspace } })
    const response = await app.inject('/api/v1/campaigns/campaign-1/workspace')
    expect(response.statusCode).toBe(401)
    expect(getWorkspace).not.toHaveBeenCalled()
    await app.close()
  })
  test('returns a strict private snapshot with revision and serialized dates', async () => {
    const getWorkspace = vi.fn(async () => workspace)
    const app = buildApp({ resolveActor: async () => ({ id: 'd1', role: 'designer' }), workflowService: {}, workspaceService: { getWorkspace } })
    const response = await app.inject('/api/v1/campaigns/campaign-1/workspace')
    expect(response.statusCode).toBe(200)
    expect(response.headers.etag).toBe('"2"')
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.json()).toMatchObject({ campaign: { id: 'campaign-1', createdAt: campaign.createdAt.toISOString() }, copies: [] })
    expect(getWorkspace).toHaveBeenCalledWith({ actor: { id: 'd1', role: 'designer' }, campaignId: 'campaign-1' })
    await app.close()
  })
  test('does not serialize storage keys accidentally returned by a service', async () => {
    const app = buildApp({ resolveActor: async () => ({ id: 'm1', role: 'marketer' }), workflowService: {}, workspaceService: { getWorkspace: async () => ({ ...workspace, objectKey: 'secret-storage-key' }) } })
    const response = await app.inject('/api/v1/campaigns/campaign-1/workspace')
    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('secret-storage-key')
    await app.close()
  })
  test('returns 404 for a missing or archived campaign', async () => {
    const app = buildApp({ resolveActor: async () => ({ id: 'm1', role: 'marketer' }), workflowService: {}, workspaceService: { getWorkspace: async () => null } })
    expect((await app.inject('/api/v1/campaigns/missing/workspace')).statusCode).toBe(404)
    await app.close()
  })
})
