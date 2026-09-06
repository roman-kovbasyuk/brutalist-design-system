import { randomUUID } from 'node:crypto'
import { campaignPatchRequestSchema, campaignRecordSchema, createCampaignRequestSchema, createInvitationRequestSchema, createTemplateVersionRequestSchema, settingsPatchRequestSchema } from '../../shared/contracts.js'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { rawBrief } from '../../shared/briefAnalysis.js'
import { withTransaction } from '../db/pool.js'
import { createCampaignRepository } from '../repositories/campaignRepository.js'
import { createSettingsRepository } from '../repositories/settingsRepository.js'
import { createTemplateRepository } from '../repositories/templateRepository.js'
import { createUserRepository } from '../repositories/userRepository.js'
import { createAuditRepository } from '../repositories/auditRepository.js'
import { assertProviderRegistry, generationProviderRegistry, providerTupleAllowed } from '../providers/registry.js'
import { applyArtifactEdit } from '../../shared/workflowRules.js'

const campaignEditors = ['marketer', 'admin']
const invitationTtlMs = 7 * 24 * 60 * 60 * 1000

export class WorkflowServiceError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'WorkflowServiceError'
    this.statusCode = statusCode
    this.code = code
    this.publicMessage = message
    this.details = details
    this.expose = true
  }
}

const defaultRepositories = {
  campaign: createCampaignRepository,
  settings: createSettingsRepository,
  template: createTemplateRepository,
  user: createUserRepository,
  audit: createAuditRepository,
}

function validate(schema, value) {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new WorkflowServiceError(400, 'invalid_request', 'Request validation failed', parsed.error.issues.map((issue) => ({
    path: issue.path.join('.'), message: issue.message,
  })))
}

function requireRole(actor, roles) {
  if (!actor || !roles.includes(actor.role) || actor.disabled) {
    throw new WorkflowServiceError(403, 'forbidden', 'This actor cannot perform the requested operation')
  }
}

function revisionConflict() {
  return new WorkflowServiceError(409, 'revision_conflict', 'The resource changed since it was loaded')
}

function missing(name) {
  return new WorkflowServiceError(404, 'not_found', `${name} was not found`)
}

function campaignUpdateInput(id, campaign, expectedRevision) {
  return {
    id,
    expectedRevision,
    title: campaign.title,
    brief: campaign.brief,
    status: campaign.status,
    selectedCopyId: campaign.selectedCopyId,
    selectedDirectionId: campaign.selectedDirectionId,
    compositionId: campaign.compositionId,
    currentVersionNumber: campaign.currentVersionNumber,
    openVersionId: campaign.openVersionId,
  }
}

function lockedCampaignSnapshot(value) {
  const parsed = campaignRecordSchema.safeParse(value)
  if (!parsed.success) throw new Error('Persistence returned an invalid campaign state')
  return structuredClone(parsed.data)
}

function commandCampaignResult(value, lockedId) {
  const parsed = campaignRecordSchema.safeParse(value)
  if (!parsed.success) throw new WorkflowServiceError(409, 'invalid_campaign_result', 'Campaign command returned an invalid state')
  if (parsed.data.id !== lockedId) throw new WorkflowServiceError(409, 'campaign_identity_mismatch', 'Campaign commands cannot change campaign identity')
  return parsed.data
}

export function createWorkflowService({
  pool,
  transaction = withTransaction,
  repositories = defaultRepositories,
  idGenerator = randomUUID,
  clock = () => new Date(),
  providerRegistry = generationProviderRegistry,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  if (typeof transaction !== 'function') throw new TypeError('A transaction function is required')
  assertProviderRegistry(providerRegistry)

  const audit = async (client, event) => repositories.audit(client).append({
    id: idGenerator(),
    createdAt: clock(),
    ...event,
  })

  const executeCampaignCommand = async ({
    actor,
    campaignId,
    expectedRevision,
    action,
    validate: validateCommand = () => true,
    apply,
    afterPersist,
    auditPayload = {},
  }) => {
    requireRole(actor, campaignEditors)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new WorkflowServiceError(400, 'invalid_revision', 'Expected revision must be a non-negative integer')
    }
    if (typeof validateCommand !== 'function' || typeof apply !== 'function') {
      throw new TypeError('Campaign commands require validate and apply functions')
    }

    return transaction(pool, async (client) => {
      const campaigns = repositories.campaign(client)
      const current = await campaigns.findByIdForUpdate(campaignId)
      if (!current) throw missing('Campaign')
      const snapshot = lockedCampaignSnapshot(current)
      const lockedId = snapshot.id
      if (snapshot.revision !== expectedRevision) throw revisionConflict()

      const validation = await validateCommand({ campaign: structuredClone(snapshot), actor })
      if (validation !== true) {
        if (validation instanceof Error) throw validation
        throw new WorkflowServiceError(409, 'command_rejected', 'The command is not valid for the current campaign')
      }

      const desired = commandCampaignResult(await apply(structuredClone(snapshot)), lockedId)
      let persisted
      try {
        persisted = commandCampaignResult(
          await campaigns.updateState(campaignUpdateInput(lockedId, desired, expectedRevision)),
          lockedId,
        )
      } catch (error) {
        if (error?.code === 'revision_conflict') throw revisionConflict()
        if (error?.code === 'not_found') throw missing('Campaign')
        throw error
      }

      await afterPersist?.({ client, campaigns, before: snapshot, desired, persisted, actor })

      await audit(client, {
        actorId: actor.id,
        actorRole: actor.role,
        action,
        entityType: 'campaign',
        entityId: lockedId,
        beforeStatus: snapshot.status,
        afterStatus: persisted.status,
        payload: auditPayload,
      })
      return persisted
    })
  }

  return {
    executeCampaignCommand,

    async listCampaigns({ actor }) {
      requireRole(actor, ['marketer', 'designer', 'admin'])
      return repositories.campaign(pool).list()
    },

    async getCampaign({ actor, campaignId }) {
      requireRole(actor, ['marketer', 'designer', 'admin'])
      return repositories.campaign(pool).findById(campaignId)
    },

    async createCampaign({ actor, input }) {
      requireRole(actor, campaignEditors)
      const command = validate(createCampaignRequestSchema, input)
      return transaction(pool, async (client) => {
        const created = await repositories.campaign(client).create({
          id: idGenerator(), ...command, createdBy: actor.id,
        })
        await audit(client, {
          actorId: actor.id, actorRole: actor.role, action: 'campaign.created',
          entityType: 'campaign', entityId: created.id, beforeStatus: null,
          afterStatus: created.status, payload: {},
        })
        return created
      })
    },

    async patchCampaign({ actor, campaignId, expectedRevision, patch }) {
      const command = validate(campaignPatchRequestSchema, patch)
      const changedFields = Object.keys(command).sort()
      const briefChanged = Object.hasOwn(command, 'brief')
      return executeCampaignCommand({
        actor,
        campaignId,
        expectedRevision,
        action: 'campaign.updated',
        validate: ({ campaign }) => {
          if (!briefChanged) return true
          const edit = applyArtifactEdit(campaign, 'brief')
          if (edit.ok) return true
          return new WorkflowServiceError(edit.status, edit.code, edit.message)
        },
        apply: (campaign) => {
          if (!briefChanged) return { ...campaign, ...command }
          const edit = applyArtifactEdit(campaign, 'brief')
          if (!edit.ok) throw new WorkflowServiceError(edit.status, edit.code, edit.message)
          const { stale: _stale, ...editedCampaign } = edit.campaign
          return {
            ...editedCampaign,
            ...command,
            brief: hashCanonical(rawBrief(campaign.brief)) === hashCanonical(rawBrief(command.brief))
              ? command.brief : { ...command.brief, analysis: null },
            selectedCopyId: edit.campaign.selectedCopyId ?? null,
            selectedDirectionId: edit.campaign.selectedDirectionId ?? null,
            compositionId: edit.campaign.compositionId ?? null,
          }
        },
        afterPersist: briefChanged
          ? ({ campaigns, before }) => campaigns.markArtifactsStale(before.id, {
              copy: true,
              directions: true,
              composition: true,
            })
          : undefined,
        auditPayload: { changedFields },
      })
    },

    async archiveCampaign({ actor, campaignId, expectedRevision }) {
      requireRole(actor, campaignEditors)
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new WorkflowServiceError(400, 'invalid_revision', 'Expected revision must be a non-negative integer')
      }
      return transaction(pool, async (client) => {
        const campaigns = repositories.campaign(client)
        const current = await campaigns.findByIdForUpdate(campaignId)
        if (!current) throw missing('Campaign')
        const snapshot = lockedCampaignSnapshot(current)
        if (snapshot.revision !== expectedRevision) throw revisionConflict()
        const archivedAt = clock()
        let archived
        try {
          archived = commandCampaignResult(
            await campaigns.archive({ id: snapshot.id, expectedRevision, archivedAt }),
            snapshot.id,
          )
        } catch (error) {
          if (error?.code === 'revision_conflict') throw revisionConflict()
          if (error?.code === 'not_found') throw missing('Campaign')
          throw error
        }
        await audit(client, {
          actorId: actor.id, actorRole: actor.role, action: 'campaign.archived',
          entityType: 'campaign', entityId: snapshot.id, beforeStatus: snapshot.status,
          afterStatus: snapshot.status, payload: {},
        })
        return archived
      })
    },

    async duplicateCampaign({ actor, campaignId }) {
      requireRole(actor, campaignEditors)
      return transaction(pool, async (client) => {
        const campaigns = repositories.campaign(client)
        const source = await campaigns.findByIdForUpdate(campaignId)
        if (!source) throw missing('Campaign')
        const created = await campaigns.create({
          id: idGenerator(),
          title: `${source.title} copy`,
          brief: rawBrief(source.brief),
          createdBy: actor.id,
        })
        await audit(client, {
          actorId: actor.id, actorRole: actor.role, action: 'campaign.duplicated',
          entityType: 'campaign', entityId: created.id, beforeStatus: null,
          afterStatus: created.status, payload: { sourceCampaignId: source.id },
        })
        return created
      })
    },

    async listTemplates({ actor }) {
      requireRole(actor, ['marketer', 'designer', 'admin'])
      return repositories.template(pool).listLatest()
    },

    async listTemplateVersions({ actor, templateId }) {
      requireRole(actor, ['marketer', 'designer', 'admin'])
      return repositories.template(pool).listVersions(templateId)
    },

    async getTemplateVersion({ actor, templateId, version }) {
      requireRole(actor, ['marketer', 'designer', 'admin'])
      return repositories.template(pool).findVersion(templateId, version)
    },

    async createTemplateVersion({ actor, input }) {
      requireRole(actor, ['admin'])
      const command = validate(createTemplateVersionRequestSchema, input)
      if (command.id !== command.manifest.id || command.version !== command.manifest.version || command.name !== command.manifest.name) {
        throw new WorkflowServiceError(400, 'template_identity_mismatch', 'Template identity must match its manifest')
      }
      return transaction(pool, async (client) => {
        const created = await repositories.template(client).createVersion({
          ...command,
          manifestHash: hashCanonical(command.manifest),
          createdBy: actor.id,
        })
        await audit(client, {
          actorId: actor.id, actorRole: actor.role, action: 'template.version_created',
          entityType: 'template', entityId: command.id, payload: { version: command.version },
        })
        return created
      })
    },

    async getSettings({ actor }) {
      requireRole(actor, ['marketer', 'designer', 'admin'])
      return repositories.settings(pool).get()
    },

    async updateSettings({ actor, expectedRevision, patch }) {
      requireRole(actor, ['admin'])
      const command = validate(settingsPatchRequestSchema, patch)
      return transaction(pool, async (client) => {
        const settings = repositories.settings(client)
        const current = await settings.getForUpdate()
        if (!current) throw missing('Settings')
        if (current.revision !== expectedRevision) throw revisionConflict()
        const desired = { ...current, ...command }
        if (!providerTupleAllowed(providerRegistry, desired)) {
          throw new WorkflowServiceError(400, 'invalid_provider_configuration', 'The selected generation provider configuration is not available')
        }
        let updated
        try {
          updated = await settings.update({ ...desired, expectedRevision, updatedBy: actor.id })
        } catch (error) {
          if (error?.code === 'revision_conflict') throw revisionConflict()
          throw error
        }
        await audit(client, {
          actorId: actor.id, actorRole: actor.role, action: 'settings.updated',
          entityType: 'settings', entityId: 'global', payload: { changedFields: Object.keys(command).sort() },
        })
        return updated
      })
    },

    async createInvitation({ actor, input }) {
      requireRole(actor, ['admin'])
      const command = validate(createInvitationRequestSchema, input)
      return transaction(pool, async (client) => {
        const now = clock()
        const invitation = await repositories.user(client).createInvitation({
          id: idGenerator(),
          email: command.email,
          role: command.role,
          invitedBy: actor.id,
          expiresAt: new Date(now.getTime() + invitationTtlMs),
        })
        await audit(client, {
          actorId: actor.id, actorRole: actor.role, action: 'invitation.created',
          entityType: 'invitation', entityId: invitation.id, payload: { role: invitation.role },
        })
        return invitation
      })
    },

    async disableUser({ actor, userId }) {
      requireRole(actor, ['admin'])
      return transaction(pool, async (client) => {
        const users = repositories.user(client)
        const current = await users.findByIdForUpdate(userId)
        if (!current) throw missing('User')
        if (current.disabled) throw new WorkflowServiceError(409, 'user_already_disabled', 'User is already disabled')
        const disabled = await users.setDisabled({ id: userId, disabled: true })
        await audit(client, {
          actorId: actor.id, actorRole: actor.role, action: 'user.disabled',
          entityType: 'user', entityId: userId, payload: {},
        })
        return disabled
      })
    },
  }
}
