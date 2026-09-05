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
      parser: 'dockerfile-ast@0.7.1',
    })
    const dockerfile = await readFile('Dockerfile', 'utf8')
    expect(dockerfile).not.toMatch(/^COPY --from=builder --chown=/m)
    expect(dockerfile).toMatch(/^RUN chmod -R a-w \/app\/package\.json \/app\/package-lock\.json \/app\/node_modules \/app\/server \/app\/shared \/app\/dist$/m)
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

  test('uses the pinned Dockerfile AST parser to reject unknown instructions and malformed JSON forms', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8')
    const dockerignore = await readFile('.dockerignore', 'utf8')
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

    expect(packageJson.devDependencies?.['dockerfile-ast']).toBe('0.7.1')
    await expect(verifyContainerConfiguration({ dockerfile: `${dockerfile}\nTHIS IS NOT A DOCKER INSTRUCTION\n`, dockerignore }))
      .rejects.toThrow(/unknown Dockerfile instruction|Dockerfile diagnostic/i)
    await expect(verifyContainerConfiguration({
      dockerfile: dockerfile.replace('CMD ["node", "server/start.js"]', 'CMD ["node",]'),
      dockerignore,
    })).rejects.toThrow(/Dockerfile diagnostic|JSON form/i)
  })

  test('rejects dangling continuations and unmatched shell-form RUN quotes without executing them', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8')
    const dockerignore = await readFile('.dockerignore', 'utf8')

    await expect(verifyContainerConfiguration({ dockerfile: `${dockerfile}RUN echo unfinished \\`, dockerignore }))
      .rejects.toThrow(/dangling.*continuation|Dockerfile diagnostic/i)
    await expect(verifyContainerConfiguration({ dockerfile: `${dockerfile}RUN echo "unterminated\n`, dockerignore }))
      .rejects.toThrow(/shell syntax|Dockerfile diagnostic/i)
  })
})
