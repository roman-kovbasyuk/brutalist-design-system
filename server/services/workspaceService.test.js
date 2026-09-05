import { describe, expect, test, vi } from 'vitest'
import { createWorkspaceService } from './workspaceService.js'

describe('workspace snapshot boundary', () => {
  test.each([null, { id: 'm1', role: 'marketer', disabled: true }, { id: 'm1', role: 'marketer', disabledAt: new Date() }, { id: 'unknown', role: 'visitor' }])('rejects inactive or unauthorized actor before database access', async (actor) => {
    const transaction = vi.fn()
    await expect(createWorkspaceService({ pool: {}, transaction }).getWorkspace({ actor, campaignId: 'campaign' })).rejects.toMatchObject({ statusCode: 403 })
    expect(transaction).not.toHaveBeenCalled()
  })
  test('establishes a read-only consistent snapshot before looking up a campaign', async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }) }
    const transaction = vi.fn(async (_pool, operation) => operation(client))
    const result = await createWorkspaceService({ pool: {}, transaction }).getWorkspace({ actor: { id: 'm1', role: 'marketer' }, campaignId: 'missing' })
    expect(result).toBeNull()
    expect(client.query.mock.calls[0][0]).toBe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    expect(client.query.mock.calls[1]).toEqual(['SELECT * FROM campaigns WHERE id = $1 AND archived_at IS NULL', ['missing']])
    expect(client.query).toHaveBeenCalledTimes(2)
  })
})
