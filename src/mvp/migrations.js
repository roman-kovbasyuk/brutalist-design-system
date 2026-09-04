export function migrateStoredCampaign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  if (!value.brief || typeof value.brief !== 'object' || Array.isArray(value.brief)) return value
  if (typeof value.brief.text === 'string') return value

  const labels = [
    ['Product', value.brief.product],
    ['Audience', value.brief.audience],
    ['Goal', value.brief.goal],
    ['Offer', value.brief.offer],
    ['Notes', value.brief.notes],
  ]
  const text = labels
    .filter(([, fieldValue]) => typeof fieldValue === 'string' && fieldValue.trim())
    .map(([label, fieldValue]) => `${label}: ${fieldValue.trim()}`)
    .join('\n')

  return {
    ...value,
    brief: {
      text,
      product: typeof value.brief.product === 'string' ? value.brief.product : '',
      audience: typeof value.brief.audience === 'string' ? value.brief.audience : '',
      goal: typeof value.brief.goal === 'string' ? value.brief.goal : '',
      offer: typeof value.brief.offer === 'string' ? value.brief.offer : '',
    },
  }
}
