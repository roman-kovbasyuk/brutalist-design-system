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
