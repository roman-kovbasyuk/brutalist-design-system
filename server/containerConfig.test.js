import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { verifyContainerConfiguration } from '../scripts/verify-container.mjs'

describe('production container configuration', () => {
  test('uses one pinned Node 22 runtime serving API, app, and docs as a non-root process', async () => {
    await expect(verifyContainerConfiguration()).resolves.toMatchObject({
      stages: 2,
      runtimeUser: 'node',
      port: 8080,
      staticRoot: '/app/dist',
    })
  })

  test('rejects a runtime without its non-root user or production-only dependency pruning', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8')
    const dockerignore = await readFile('.dockerignore', 'utf8')

    await expect(verifyContainerConfiguration({
      dockerfile: dockerfile.replace(/^USER node$/m, ''),
      dockerignore,
    })).rejects.toThrow(/non-root Node user/i)
    await expect(verifyContainerConfiguration({
      dockerfile: dockerfile.replace('npm prune --omit=dev', 'npm prune'),
      dockerignore,
    })).rejects.toThrow(/production-only dependencies/i)
  })

  test('rejects copied local artifacts and migration or secret-bearing startup commands', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8')
    const dockerignore = await readFile('.dockerignore', 'utf8')

    await expect(verifyContainerConfiguration({ dockerfile, dockerignore: dockerignore.replace(/^\.env\*$/m, '') }))
      .rejects.toThrow(/environment files/i)
    await expect(verifyContainerConfiguration({
      dockerfile: dockerfile.replace('CMD ["node", "server/start.js"]', 'CMD ["sh", "-c", "node server/db/migrate.js && node server/start.js"]'),
      dockerignore,
    })).rejects.toThrow(/migration/i)
    await expect(verifyContainerConfiguration({
      dockerfile: `${dockerfile}\nENV API_TOKEN=baked-secret\n`,
      dockerignore,
    })).rejects.toThrow(/secret-bearing/i)
  })
})
