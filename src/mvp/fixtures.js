export const mockActors = {
  marketer: { id: 'maya', role: 'marketer', name: 'Maya Chen' },
  designer: { id: 'vlad', role: 'designer', name: 'Vlad' },
  admin: { id: 'roman', role: 'admin', name: 'Roman' },
}

export function createDraftCampaignFixture({ id, name, now }) {
  return {
    id,
    name,
    status: 'draft',
    brief: {
      product: '',
      audience: '',
      goal: '',
      offer: '',
      notes: '',
    },
    copySets: [],
    selectedCopyId: null,
    directions: [],
    selectedDirectionId: null,
    composition: null,
    versions: [],
    reviewEvents: [],
    delivery: null,
    providerMode: 'mock',
    updatedAt: now,
  }
}

export function createMockCopySet({ campaign, now = () => new Date().toISOString(), id = randomId }) {
  const offer = campaign.brief.offer.trim()
  const product = campaign.brief.product.trim()
  const audience = campaign.brief.audience.trim()

  return {
    id: `copy-set-${id()}`,
    createdAt: now(),
    candidates: [
      {
        id: `copy-${id()}`,
        headline: 'Speak sooner',
        body: `${product} made practical for ${audience.toLowerCase()}.`,
        offer,
        cta: 'Start learning',
      },
      {
        id: `copy-${id()}`,
        headline: 'Feel at home',
        body: `Build useful language habits for everyday life.`,
        offer,
        cta: 'Try it today',
      },
      {
        id: `copy-${id()}`,
        headline: 'Make every day easier',
        body: `Short, focused lessons built around your goal: ${campaign.brief.goal.trim().toLowerCase()}.`,
        offer,
        cta: 'See the course',
      },
    ],
  }
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
