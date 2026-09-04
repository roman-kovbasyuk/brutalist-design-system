import { describe, expect, test, vi } from 'vitest'
import { createWorkflowService } from './workflowService.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'
import { hashCanonical } from '../../shared/canonicalJson.js'

const actor = { id: 'marketer-1', role: 'marketer', disabled: false }
const admin = { id: 'admin-1', role: 'admin', disabled: false }
const brief = { product: 'Course', audience: 'Learners', objective: 'Signups', offer: '', locale: 'en', notes: '' }
const currentCampaign = {
  id: 'campaign-1', title: 'Autumn', brief, status: 'draft', revision: 2,
  selectedCopyId: null, selectedDirectionId: null, compositionId: null,
  currentVersionNumber: 0, openVersionId: null, createdBy: actor.id,
}

function harness(overrides = {}) {
  const calls = []
  const campaignRepository = {
    findByIdForUpdate: vi.fn(async () => { calls.push('lock/load'); return currentCampaign }),
    updateState: vi.fn(async (input) => { calls.push('persist'); return { ...currentCampaign, ...input, revision: input.expectedRevision + 1 } }),
    create: vi.fn(async (input) => ({ ...currentCampaign, ...input, revision: 0 })),
    findById: vi.fn(async () => currentCampaign),
    list: vi.fn(async () => [currentCampaign]),
  }
  const settings = {
    provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits: 0,
    perStepRegenerationLimit: 3, generationDisabled: false, revision: 4, updatedBy: null,
  }
  const settingsRepository = {
    get: vi.fn(async () => settings),
    getForUpdate: vi.fn(async () => { calls.push('lock/load'); return settings }),
    update: vi.fn(async (input) => { calls.push('persist'); return { ...settings, ...input, revision: input.expectedRevision + 1 } }),
  }
  const auditRepository = {
    append: vi.fn(async (event) => { calls.push('audit'); return event }),
  }
  const templateRepository = {
    listLatest: vi.fn(async () => []), listVersions: vi.fn(async () => []), findVersion: vi.fn(async () => null),
    createVersion: vi.fn(async (input) => input),
  }
  const userRepository = {
    createInvitation: vi.fn(async (input) => ({ ...input, acceptedUserId: null, acceptedAt: null, revokedAt: null })),
    findByIdForUpdate: vi.fn(async (id) => ({ id, email: 'person@example.com', role: 'designer', disabled: false })),
    setDisabled: vi.fn(async ({ id, disabled }) => ({ id, email: 'person@example.com', role: 'designer', disabled })),
  }
  const repositories = {
    campaign: () => campaignRepository,
    settings: () => settingsRepository,
    audit: () => auditRepository,
    template: () => templateRepository,
    user: () => userRepository,
  }
  let id = 0
  const service = createWorkflowService({
    pool: { query: vi.fn() },
    transaction: async (_pool, operation) => operation({ query: vi.fn() }),
    repositories,
    idGenerator: () => `generated-${++id}`,
    clock: () => new Date('2026-09-04T10:00:00.000Z'),
    ...overrides,
  })
  return { service, calls, campaignRepository, settingsRepository, auditRepository, templateRepository, userRepository }
}

describe('workflow service', () => {
  test('orders campaign edits as lock/load, revision and command validation, persist, then audit', async () => {
    const { service, calls, campaignRepository, auditRepository } = harness()
    const commandValidation = vi.fn(() => { calls.push('validate'); return true })

    const updated = await service.executeCampaignCommand({
      actor,
      campaignId: currentCampaign.id,
      expectedRevision: 2,
      action: 'campaign.updated',
      validate: commandValidation,
      apply: (campaign) => ({ ...campaign, title: 'Winter' }),
      auditPayload: { changedFields: ['title'] },
    })

    expect(calls).toEqual(['lock/load', 'validate', 'persist', 'audit'])
    expect(updated).toMatchObject({ title: 'Winter', revision: 3 })
    expect(campaignRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'campaign-1', expectedRevision: 2, title: 'Winter' }))
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({
      id: 'generated-1', actorId: actor.id, actorRole: actor.role, action: 'campaign.updated',
      entityType: 'campaign', entityId: 'campaign-1', createdAt: new Date('2026-09-04T10:00:00.000Z'),
    }))
  })

  test('rejects a stale campaign revision before validation, persistence, or audit', async () => {
    const { service, calls, campaignRepository, auditRepository } = harness()
    const validate = vi.fn(() => true)

    await expect(service.executeCampaignCommand({
      actor, campaignId: 'campaign-1', expectedRevision: 1, action: 'campaign.updated', validate,
      apply: (campaign) => campaign,
    })).rejects.toMatchObject({ statusCode: 409, code: 'revision_conflict', expose: true })

    expect(calls).toEqual(['lock/load'])
    expect(validate).not.toHaveBeenCalled()
    expect(campaignRepository.updateState).not.toHaveBeenCalled()
    expect(auditRepository.append).not.toHaveBeenCalled()
  })

  test('uses the campaign command path for strict title and brief patches', async () => {
    const { service, campaignRepository, auditRepository } = harness()

    const updated = await service.patchCampaign({ actor, campaignId: 'campaign-1', expectedRevision: 2, patch: { title: ' Winter ' } })

    expect(updated.title).toBe('Winter')
    expect(campaignRepository.updateState).toHaveBeenCalledOnce()
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({ payload: { changedFields: ['title'] } }))
    await expect(service.patchCampaign({ actor, campaignId: 'campaign-1', expectedRevision: 2, patch: { status: 'approved' } }))
      .rejects.toMatchObject({ statusCode: 400, code: 'invalid_request' })
  })

  test('revision-protects settings and audits only after persistence', async () => {
    const { service, calls, settingsRepository, auditRepository } = harness()

    const updated = await service.updateSettings({ actor: admin, expectedRevision: 4, patch: { generationDisabled: true } })

    expect(calls).toEqual(['lock/load', 'persist', 'audit'])
    expect(updated).toMatchObject({ generationDisabled: true, revision: 5, updatedBy: admin.id })
    expect(settingsRepository.update).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, generationDisabled: true, updatedBy: admin.id }))
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'settings.updated', createdAt: new Date('2026-09-04T10:00:00.000Z') }))
  })

  test('creates immutable template versions with a service-generated hash and audit event', async () => {
    const { service, templateRepository, auditRepository } = harness()

    const result = await service.createTemplateVersion({
      actor: admin,
      input: { id: pilotTemplateFixture.id, version: pilotTemplateFixture.version, name: pilotTemplateFixture.name, manifest: pilotTemplateFixture },
    })

    expect(result.manifestHash).toBe(hashCanonical(pilotTemplateFixture))
    expect(templateRepository.createVersion).toHaveBeenCalledWith(expect.objectContaining({ createdBy: admin.id, manifestHash: hashCanonical(pilotTemplateFixture) }))
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'template.version_created' }))
  })

  test('normalizes invitations and generates IDs and expiry from the injected clock', async () => {
    const { service, userRepository, auditRepository } = harness()

    const invitation = await service.createInvitation({ actor: admin, input: { email: ' PERSON@EXAMPLE.COM ', role: 'designer' } })

    expect(invitation).toMatchObject({ id: 'generated-1', email: 'person@example.com', invitedBy: admin.id })
    expect(invitation.expiresAt).toEqual(new Date('2026-09-11T10:00:00.000Z'))
    expect(userRepository.createInvitation).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: new Date('2026-09-11T10:00:00.000Z') }))
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({ id: 'generated-2', action: 'invitation.created' }))
  })

  test('locks and disables users before appending a generated audit event', async () => {
    const { service, calls, userRepository, auditRepository } = harness()
    userRepository.findByIdForUpdate.mockImplementationOnce(async (id) => { calls.push('lock/load'); return { id, disabled: false, role: 'designer' } })
    userRepository.setDisabled.mockImplementationOnce(async ({ id }) => { calls.push('persist'); return { id, disabled: true, role: 'designer' } })

    const user = await service.disableUser({ actor: admin, userId: 'person-1' })

    expect(user.disabled).toBe(true)
    expect(calls).toEqual(['lock/load', 'persist', 'audit'])
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.disabled', entityId: 'person-1' }))
  })
})
