import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { verifyContainerConfiguration } from '../scripts/verify-container.mjs'

function replaceHealthcheck(source, replacement) {
  return source.replace(/^HEALTHCHECK[\s\S]*?(?=\n\nCMD )/m, replacement)
}

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

  test.each([
    ['shell COPY without a destination', (source) => source.replace('COPY package.json package-lock.json ./', 'COPY package.json'), /COPY.*source.*destination|COPY.*arguments/i],
    ['JSON COPY without a destination', (source) => `${source}\nCOPY ["only-source"]\n`, /COPY.*source.*destination|COPY.*arguments/i],
    ['shell ADD without a destination', (source) => `${source}\nADD archive.tar\n`, /ADD.*source.*destination|ADD.*arguments/i],
    ['JSON ADD without a destination', (source) => `${source}\nADD ["archive.tar"]\n`, /ADD.*source.*destination|ADD.*arguments/i],
    ['ENV without a value', (source) => `${source}\nENV ONLY_KEY\n`, /ENV.*value|ENV.*assignment/i],
    ['HEALTHCHECK with the wrong command keyword', (source) => replaceHealthcheck(source, 'HEALTHCHECK --interval=30s RUN echo /healthz'), /HEALTHCHECK.*CMD|HEALTHCHECK.*NONE/i],
    ['HEALTHCHECK NONE with trailing arguments', (source) => replaceHealthcheck(source, 'HEALTHCHECK NONE extra'), /HEALTHCHECK.*NONE|HEALTHCHECK.*CMD/i],
    ['HEALTHCHECK CMD without a command', (source) => replaceHealthcheck(source, 'HEALTHCHECK CMD'), /HEALTHCHECK.*command/i],
  ])('rejects semantically incomplete Docker instructions: %s', async (_name, mutate, error) => {
    const dockerfile = await readFile('Dockerfile', 'utf8')
    const dockerignore = await readFile('.dockerignore', 'utf8')
    await expect(verifyContainerConfiguration({ dockerfile: mutate(dockerfile), dockerignore })).rejects.toThrow(error)
  })

  test.each([
    ['instruction before the first FROM', (source) => `RUN echo preface\n${source}`, /before.*FROM|FROM.*first/i],
    ['extra USER argument', (source) => `${source}\nUSER node extra\n`, /USER.*one argument/i],
    ['extra WORKDIR argument', (source) => `${source}\nWORKDIR "/app" extra\n`, /WORKDIR.*one argument/i],
    ['invalid EXPOSE port', (source) => `${source}\nEXPOSE not-a-port\n`, /EXPOSE.*port/i],
    ['shell-form SHELL instruction', (source) => `${source}\nSHELL bin sh\n`, /SHELL.*JSON/i],
  ])('audits common Docker instruction forms and stage ordering: %s', async (_name, mutate, error) => {
    const dockerfile = await readFile('Dockerfile', 'utf8')
    const dockerignore = await readFile('.dockerignore', 'utf8')
    await expect(verifyContainerConfiguration({ dockerfile: mutate(dockerfile), dockerignore })).rejects.toThrow(error)
  })
})
