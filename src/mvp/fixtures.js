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
      text: '',
      product: '',
      audience: '',
      goal: '',
      offer: '',
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
  const brief = excerptFromBrief(campaign.brief.text)
  const offer = campaign.brief.offer.trim()

  return {
    id: `copy-set-${id()}`,
    createdAt: now(),
    candidates: [
      {
        id: `copy-${id()}`,
        headline: 'Speak sooner',
        body: brief,
        offer,
        cta: 'Start learning',
      },
      {
        id: `copy-${id()}`,
        headline: 'Feel at home',
        body: brief,
        offer,
        cta: 'Try it today',
      },
      {
        id: `copy-${id()}`,
        headline: 'Make every day easier',
        body: brief,
        offer,
        cta: 'See the course',
      },
    ],
  }
}

function excerptFromBrief(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ''
  const sentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()
  return (sentence ?? text).slice(0, 120).trim()
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
