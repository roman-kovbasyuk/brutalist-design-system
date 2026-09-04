function mapSettings(row) {
  if (!row) return null
  return {
    provider: row.provider,
    model: row.model,
    region: row.region,
    dailyBudgetMicrounits: Number(row.daily_budget_microunits),
    perStepRegenerationLimit: row.per_step_regeneration_limit,
    generationDisabled: row.generation_disabled,
    revision: row.revision,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

export class SettingsRevisionConflictError extends Error {
  constructor(expectedRevision) {
    super(`Settings are not at revision ${expectedRevision}`)
    this.name = 'SettingsRevisionConflictError'
    this.code = 'revision_conflict'
  }
}

export function createSettingsRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')

  return {
    async get() {
      const result = await client.query('SELECT * FROM settings WHERE singleton = $1', [true])
      return mapSettings(result.rows[0])
    },

    async getForUpdate() {
      const result = await client.query('SELECT * FROM settings WHERE singleton = $1 FOR UPDATE', [true])
      return mapSettings(result.rows[0])
    },

    async update({ expectedRevision, provider, model, region, dailyBudgetMicrounits, perStepRegenerationLimit, generationDisabled, updatedBy }) {
      const result = await client.query(
        `UPDATE settings
         SET provider = $2,
             model = $3,
             region = $4,
             daily_budget_microunits = $5,
             per_step_regeneration_limit = $6,
             generation_disabled = $7,
             updated_by = $8,
             revision = revision + 1,
             updated_at = now()
         WHERE singleton = $1 AND revision = $9
         RETURNING *`,
        [true, provider, model, region, dailyBudgetMicrounits, perStepRegenerationLimit, generationDisabled, updatedBy, expectedRevision],
      )
      if (result.rowCount === 0) throw new SettingsRevisionConflictError(expectedRevision)
      return mapSettings(result.rows[0])
    },
  }
}
