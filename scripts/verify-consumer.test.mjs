import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createFixtureManifest, assertPortableConsumerSource } from './verify-consumer.mjs'

test('creates an isolated fixture manifest that depends on the packed artifact', () => {
  const manifest = createFixtureManifest('/tmp/brutalist-design-system-0.1.0.tgz')

  assert.equal(manifest.private, true)
  assert.equal(manifest.dependencies['brutalist-design-system'], 'file:/tmp/brutalist-design-system-0.1.0.tgz')
  assert.equal(manifest.dependencies.react, '19.2.8')
  assert.equal(manifest.devDependencies.vite, '8.2.2')
})

test('rejects consumer source that reaches into this repository', () => {
  assert.doesNotThrow(() => assertPortableConsumerSource("import { AppButton } from 'brutalist-design-system'"))
  assert.throws(() => assertPortableConsumerSource("import { AppButton } from '../../src/components/design-system'"))
  assert.throws(() => assertPortableConsumerSource("import { AppButton } from '@design-system'"))
})

test('publishes a declaration for the public stylesheet export', () => {
  const repositoryRoot = join(fileURLToPath(new URL('..', import.meta.url)))
  const packageJson = join(repositoryRoot, 'dist-library/package.json')
  assert.equal(existsSync(join(repositoryRoot, 'dist-library/styles.css.d.ts')), true)
  assert.equal(JSON.parse(readFileSync(packageJson, 'utf8')).exports['./styles.css'].types, './styles.css.d.ts')
})

test('bundles stylesheet dependencies into the public stylesheet', () => {
  const repositoryRoot = join(fileURLToPath(new URL('..', import.meta.url)))
  const stylesheet = readFileSync(join(repositoryRoot, 'dist-library/styles.css'), 'utf8')
  assert.doesNotMatch(stylesheet, /^@import/m)
})
