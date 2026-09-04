import { campaignSchema } from './contracts.js'
import { createDraftCampaignFixture } from './fixtures.js'
import { idempotencyStorageKey, MVP_STORAGE_KEY, parseMutationMeta } from './gateway.js'
import { migrateStoredCampaign } from './migrations.js'
import { getAvailableActions as getWorkflowActions, transitionCampaign } from './workflowRules.js'

export function createMockCampaignGateway({
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
  id = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}`,
  latency = 120,
} = {}) {
  async function listCampaigns() {
    await wait(latency)
    return readState(storage).campaigns
      .map((campaign) => campaignSchema.parse(campaign))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
  }

  async function getCampaign(campaignId) {
    await wait(latency)
    const campaign = readState(storage).campaigns.find((item) => item.id === campaignId)
    return campaign ? campaignSchema.parse(campaign) : null
  }

  async function createCampaign(input, metaInput) {
    const meta = parseMutationMeta(metaInput)
    const state = readState(storage)
    const storedResult = getIdempotentResult(state, meta)
    if (storedResult) return storedResult

    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('campaign_name_required')

    const campaign = campaignSchema.parse(createDraftCampaignFixture({
      id: `campaign-${id()}`,
      name,
      now: now(),
    }))
    state.campaigns.push(campaign)
    storeIdempotentResult(state, meta, campaign)
    writeState(storage, state)
    await wait(latency)
    return campaignSchema.parse(campaign)
  }

  async function performAction(campaignId, action, input, metaInput) {
    const meta = parseMutationMeta(metaInput)
    const state = readState(storage)
    const storedResult = getIdempotentResult(state, meta)
    if (storedResult) return storedResult

    const campaignIndex = state.campaigns.findIndex((campaign) => campaign.id === campaignId)
    if (campaignIndex < 0) throw new Error('campaign_not_found')

    const campaign = transitionCampaign(state.campaigns[campaignIndex], action, meta.actor, input, { now, id })
    state.campaigns[campaignIndex] = campaign
    storeIdempotentResult(state, meta, campaign)
    writeState(storage, state)
    await wait(latency)
    return campaignSchema.parse(campaign)
  }

  async function getAvailableActions(campaignId, actor) {
    const campaign = await getCampaign(campaignId)
    if (!campaign) throw new Error('campaign_not_found')
    return getWorkflowActions(campaign, actor)
  }

  async function reset() {
    storage?.removeItem(MVP_STORAGE_KEY)
    await wait(latency)
  }

  return { listCampaigns, getCampaign, createCampaign, performAction, getAvailableActions, reset }
}

function readState(storage) {
  if (!storage) return emptyState()

  try {
    const raw = storage.getItem(MVP_STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.campaigns) || !isRecord(parsed?.idempotencyResults)) return emptyState()
    const campaigns = parsed.campaigns
      .map(migrateStoredCampaign)
      .map((campaign) => campaignSchema.safeParse(campaign))
      .filter((result) => result.success)
      .map((result) => result.data)
    return { campaigns, idempotencyResults: parsed.idempotencyResults }
  } catch {
    return emptyState()
  }
}

function writeState(storage, state) {
  if (!storage) throw new Error('storage_unavailable')
  storage.setItem(MVP_STORAGE_KEY, JSON.stringify(state))
}

function emptyState() {
  return { campaigns: [], idempotencyResults: {} }
}

function getIdempotentResult(state, meta) {
  const stored = state.idempotencyResults[idempotencyStorageKey(meta.actor, meta.idempotencyKey)]
  if (!stored) return null
  return campaignSchema.parse(migrateStoredCampaign(stored))
}

function storeIdempotentResult(state, meta, campaign) {
  state.idempotencyResults[idempotencyStorageKey(meta.actor, meta.idempotencyKey)] = campaign
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function wait(latency) {
  if (!latency) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, latency))
}
