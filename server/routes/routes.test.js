import { describe, expect, test, vi } from 'vitest'
import { buildApp } from '../app.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'

const brief = {
  product: 'Course', audience: 'Learners', objective: 'Signups', offer: '', locale: 'en', notes: '',
}

function campaign(overrides = {}) {
  return {
    id: 'campaign-1', title: 'Autumn launch', brief, status: 'draft', revision: 0,
    selectedCopyId: null, selectedDirectionId: null, compositionId: null,
    currentVersionNumber: 0, openVersionId: null, createdBy: 'marketer-1',
    createdAt: '2026-09-04T10:00:00.000Z', updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  }
}

function services(overrides = {}) {
  return {
    listCampaigns: vi.fn(async () => [campaign()]),
    createCampaign: vi.fn(async () => campaign()),
    getCampaign: vi.fn(async () => campaign()),
    patchCampaign: vi.fn(async () => campaign({ title: 'Winter launch', revision: 1 })),
    listTemplates: vi.fn(async () => []),
    listTemplateVersions: vi.fn(async () => []),
    getTemplateVersion: vi.fn(async () => null),
    createTemplateVersion: vi.fn(async ({ input, actor }) => ({
      ...input, manifestHash: 'a'.repeat(64), createdBy: actor.id, createdAt: '2026-09-04T10:00:00.000Z',
    })),
    getSettings: vi.fn(async () => ({
      provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits: 0,
      perStepRegenerationLimit: 3, generationDisabled: false, revision: 0,
      updatedBy: null, updatedAt: '2026-09-04T10:00:00.000Z',
    })),
    updateSettings: vi.fn(async () => ({
      provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits: 0,
      perStepRegenerationLimit: 3, generationDisabled: true, revision: 1,
      updatedBy: 'admin-1', updatedAt: '2026-09-04T10:00:00.000Z',
    })),
    createInvitation: vi.fn(async ({ input }) => ({
      id: 'invite-1', email: input.email, role: input.role, invitedBy: 'admin-1', acceptedUserId: null,
      expiresAt: '2026-09-11T10:00:00.000Z', acceptedAt: null, revokedAt: null,
      createdAt: '2026-09-04T10:00:00.000Z',
    })),
    disableUser: vi.fn(async ({ userId }) => ({
      id: userId, email: 'person@example.com', firebaseUid: 'firebase-person', role: 'designer',
      displayName: 'Person', disabled: true, createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z',
    })),
    ...overrides,
  }
}

function makeApp({ role = 'marketer', actor, workflowService = services() } = {}) {
  const resolvedActor = actor === undefined ? { id: `${role}-1`, role, disabled: false } : actor
  return {
    app: buildApp({ resolveActor: vi.fn(async () => resolvedActor), workflowService }),
    workflowService,
  }
}

describe('versioned workflow routes', () => {
  test('lists, creates, and gets campaigns through the injected service', async () => {
    const { app, workflowService } = makeApp()

    const listed = await app.inject({ method: 'GET', url: '/api/v1/campaigns' })
    const created = await app.inject({ method: 'POST', url: '/api/v1/campaigns', payload: { title: 'Autumn launch', brief } })
    const loaded = await app.inject({ method: 'GET', url: '/api/v1/campaigns/campaign-1' })

    expect(listed.statusCode).toBe(200)
    expect(listed.json().campaigns).toHaveLength(1)
    expect(created.statusCode).toBe(201)
    expect(created.headers.etag).toBe('"0"')
    expect(loaded.statusCode).toBe(200)
    expect(loaded.headers.etag).toBe('"0"')
    expect(workflowService.createCampaign).toHaveBeenCalledWith({
      actor: expect.objectContaining({ id: 'marketer-1' }),
      input: { title: 'Autumn launch', brief },
    })
    await app.close()
  })

  test('requires quoted integer If-Match and rejects protected campaign fields', async () => {
    const { app, workflowService } = makeApp()

    const missing = await app.inject({ method: 'PATCH', url: '/api/v1/campaigns/campaign-1', payload: { title: 'Winter launch' } })
    const malformed = await app.inject({ method: 'PATCH', url: '/api/v1/campaigns/campaign-1', headers: { 'if-match': '0' }, payload: { title: 'Winter launch' } })
    const protectedField = await app.inject({ method: 'PATCH', url: '/api/v1/campaigns/campaign-1', headers: { 'if-match': '"0"' }, payload: { title: 'Winter launch', status: 'approved' } })
    const edited = await app.inject({ method: 'PATCH', url: '/api/v1/campaigns/campaign-1', headers: { 'if-match': '"0"' }, payload: { title: 'Winter launch' } })

    expect(missing.statusCode).toBe(428)
    expect(missing.json().code).toBe('precondition_required')
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json().code).toBe('invalid_if_match')
    expect(protectedField.statusCode).toBe(400)
    expect(protectedField.json()).toMatchObject({ code: 'invalid_request', details: expect.any(Array) })
    expect(edited.statusCode).toBe(200)
    expect(edited.headers.etag).toBe('"1"')
    expect(workflowService.patchCampaign).toHaveBeenCalledOnce()
    expect(workflowService.patchCampaign).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, patch: { title: 'Winter launch' } }))
    await app.close()
  })

  test('returns a normalized revision conflict without leaking persistence errors', async () => {
    const workflowService = services({
      patchCampaign: vi.fn(async () => {
        const error = new Error('database row detail must stay private')
        error.statusCode = 409
        error.code = 'revision_conflict'
        error.publicMessage = 'The resource changed since it was loaded'
        error.expose = true
        throw error
      }),
    })
    const { app } = makeApp({ workflowService })

    const response = await app.inject({
      method: 'PATCH', url: '/api/v1/campaigns/campaign-1', headers: { 'if-match': '"2"' }, payload: { title: 'Winter launch' },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'revision_conflict', message: 'The resource changed since it was loaded', requestId: response.headers['x-request-id'],
    })
    expect(response.body).not.toContain('database')
    await app.close()
  })

  test('enforces invited and campaign-editor role boundaries before services run', async () => {
    const designer = makeApp({ role: 'designer' })
    const anonymous = makeApp({ actor: null })
    const disabled = makeApp({ actor: { id: 'disabled-1', role: 'admin', disabled: true } })

    expect((await designer.app.inject({ method: 'GET', url: '/api/v1/campaigns' })).statusCode).toBe(200)
    expect((await designer.app.inject({ method: 'POST', url: '/api/v1/campaigns', payload: { title: 'Launch', brief } })).statusCode).toBe(403)
    expect(designer.workflowService.createCampaign).not.toHaveBeenCalled()
    expect((await anonymous.app.inject({ method: 'GET', url: '/api/v1/campaigns' })).statusCode).toBe(401)
    expect((await disabled.app.inject({ method: 'GET', url: '/api/v1/campaigns' })).statusCode).toBe(403)
    await Promise.all([designer.app.close(), anonymous.app.close(), disabled.app.close()])
  })

  test('allows invited template reads but only admins can create immutable versions', async () => {
    const designer = makeApp({ role: 'designer' })
    const admin = makeApp({ role: 'admin' })
    const payload = {
      id: pilotTemplateFixture.id, version: pilotTemplateFixture.version, name: pilotTemplateFixture.name,
      manifest: pilotTemplateFixture,
    }

    expect((await designer.app.inject({ method: 'GET', url: '/api/v1/templates' })).statusCode).toBe(200)
    expect((await designer.app.inject({ method: 'POST', url: '/api/v1/templates', payload })).statusCode).toBe(403)
    const created = await admin.app.inject({ method: 'POST', url: '/api/v1/templates', payload })
    expect(created.statusCode).toBe(201)
    expect(admin.workflowService.createTemplateVersion).toHaveBeenCalledOnce()
    await Promise.all([designer.app.close(), admin.app.close()])
  })

  test('protects settings, invitation, and disable-user commands with admin role and revisions', async () => {
    const marketer = makeApp()
    const admin = makeApp({ role: 'admin' })

    expect((await marketer.app.inject({ method: 'GET', url: '/api/v1/settings' })).statusCode).toBe(200)
    expect((await marketer.app.inject({ method: 'PATCH', url: '/api/v1/settings', headers: { 'if-match': '"0"' }, payload: { generationDisabled: true } })).statusCode).toBe(403)
    expect((await marketer.app.inject({ method: 'POST', url: '/api/v1/invitations', payload: { email: 'PERSON@EXAMPLE.COM', role: 'designer' } })).statusCode).toBe(403)

    const settings = await admin.app.inject({ method: 'PATCH', url: '/api/v1/settings', headers: { 'if-match': '"0"' }, payload: { generationDisabled: true } })
    const invitation = await admin.app.inject({ method: 'POST', url: '/api/v1/invitations', payload: { email: ' PERSON@EXAMPLE.COM ', role: 'designer' } })
    const disabled = await admin.app.inject({ method: 'POST', url: '/api/v1/users/person-1/disable', payload: {} })

    expect(settings.statusCode).toBe(200)
    expect(settings.headers.etag).toBe('"1"')
    expect(invitation.statusCode).toBe(201)
    expect(admin.workflowService.createInvitation).toHaveBeenCalledWith(expect.objectContaining({ input: { email: 'person@example.com', role: 'designer' } }))
    expect(disabled.statusCode).toBe(200)
    await Promise.all([marketer.app.close(), admin.app.close()])
  })

  test('does not expose generic action or future workflow endpoints', async () => {
    const { app } = makeApp({ role: 'admin' })
    for (const url of [
      '/api/v1/campaigns/campaign-1/actions/approve',
      '/api/v1/campaigns/campaign-1/generate',
      '/api/v1/campaigns/campaign-1/review-events',
      '/api/v1/campaigns/campaign-1/deliveries',
    ]) {
      expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404)
    }
    await app.close()
  })
})
