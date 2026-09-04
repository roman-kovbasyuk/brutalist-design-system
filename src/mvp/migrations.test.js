import { describe, expect, test } from 'vitest'
import { migrateStoredCampaign } from './migrations.js'

function createLegacyCampaign() {
  return {
    id: 'campaign-autumn-launch',
    brief: {
      product: 'Norwegian course',
      audience: 'New arrivals',
      goal: 'Trial registrations',
      offer: '15% off',
      notes: 'Focus on useful everyday language.',
    },
  }
}

describe('MVP campaign migrations', () => {
  test('migrates a persisted structured brief into readable free-form text', () => {
    const legacy = createLegacyCampaign()

    const migrated = migrateStoredCampaign(legacy)

    expect(migrated.brief.text).toContain('Product: Norwegian course')
    expect(migrated.brief.text).toContain('Audience: New arrivals')
    expect(migrated.brief.text).toContain('Notes: Focus on useful everyday language.')
    expect(legacy.brief).not.toHaveProperty('text')
  })

  test('leaves an already migrated campaign unchanged', () => {
    const campaign = {
      ...createLegacyCampaign(),
      brief: {
        text: 'Launch an Oslo course.',
        product: '',
        audience: '',
        goal: '',
        offer: '',
      },
    }

    expect(migrateStoredCampaign(campaign)).toBe(campaign)
  })
})
