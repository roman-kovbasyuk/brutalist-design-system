import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { smokeProductionServer } from '../scripts/smoke-production.mjs'

test('smokes the built app and docs over an ephemeral HTTP listener and closes it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'banner-studio-production-smoke-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'docs', 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<title>Banner Studio smoke</title><script src="/assets/app-a1b2c3d4.js"></script>')
  await writeFile(join(root, 'assets', 'app-a1b2c3d4.js'), 'export {}')
  await writeFile(join(root, 'docs', 'index.html'), '<title>Docs smoke</title><script src="/docs/assets/docs-a1b2c3d4.js"></script>')
  await writeFile(join(root, 'docs', 'workflow.html'), '<title>Workflow smoke</title>')
  await writeFile(join(root, 'docs', '404.html'), '<title>Docs 404 smoke</title>')
  await writeFile(join(root, 'docs', 'assets', 'docs-a1b2c3d4.js'), 'export {}')

  await expect(smokeProductionServer({ staticRoot: root })).resolves.toMatchObject({
    port: expect.any(Number),
    closed: true,
    routes: {
      health: 200,
      spa: 200,
      browserRoute: 200,
      docsRedirect: 308,
      docs: 200,
      docsPage: 200,
      apiMissing: 404,
      privateAsset: 401,
    },
  })
  await rm(root, { recursive: true, force: true })
})
