import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureSource = join(repositoryRoot, 'fixtures/package-consumer')
const packageName = 'brutalist-design-system'

export function createFixtureManifest(tarballPath) {
  return {
    name: 'design-system-package-consumer-fixture',
    private: true,
    type: 'module',
    scripts: {
      build: 'vite build',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      [packageName]: `file:${tarballPath}`,
      react: '19.2.8',
      'react-dom': '19.2.8',
    },
    devDependencies: {
      '@types/react': '19.2.18',
      '@types/react-dom': '19.2.7',
      '@vitejs/plugin-react': '6.1.1',
      typescript: '7.0.2',
      vite: '8.2.2',
    },
  }
}

export function assertPortableConsumerSource(source) {
  if (/from\s+['"](?:\.\.?\/|@design-system)/.test(source)) {
    throw new Error('Consumer fixture must import only the installed package, never a source path or local alias.')
  }
}

function run(command, args, options) {
  execFileSync(command, args, { cwd: options.cwd, stdio: 'inherit', ...options })
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function assertFixtureUsesPublicApi(fixtureRoot) {
  const app = read(join(fixtureRoot, 'src/App.tsx'))
  const viteConfig = read(join(fixtureRoot, 'vite.config.ts'))
  assertPortableConsumerSource(app)
  if (!app.includes(`from '${packageName}'`) || !app.includes(`'${packageName}/styles.css'`)) {
    throw new Error('Consumer fixture must import the package root and public stylesheet entry.')
  }
  if (/\balias\b/.test(viteConfig)) {
    throw new Error('Consumer fixture must not configure a source alias.')
  }
}

function main() {
  const distLibrary = join(repositoryRoot, 'dist-library')
  if (!existsSync(join(distLibrary, 'package.json'))) {
    throw new Error('Missing dist-library artifact. Run npm run build:library before npm run verify:consumer.')
  }

  const workspace = mkdtempSync(join(tmpdir(), 'brutalist-design-system-consumer-'))
  const fixtureRoot = join(workspace, 'fixture')
  const npmCache = join(workspace, 'npm-cache')
  const npmOptions = { env: { ...process.env, npm_config_cache: npmCache } }
  try {
    const packageManifest = JSON.parse(read(join(distLibrary, 'package.json')))
    run('npm', ['pack', distLibrary, '--pack-destination', workspace], { cwd: repositoryRoot, ...npmOptions })
    const tarball = join(workspace, `${packageName}-${packageManifest.version}.tgz`)
    if (!existsSync(tarball)) throw new Error('npm pack did not create the design system tarball.')

    cpSync(fixtureSource, fixtureRoot, { recursive: true })
    assertFixtureUsesPublicApi(fixtureRoot)
    writeFileSync(join(fixtureRoot, 'package.json'), `${JSON.stringify(createFixtureManifest(tarball), null, 2)}\n`)

    // The fixture must be offline and cannot reuse a source alias. Copying the already-installed
    // tooling keeps the proof deterministic while npm installs the packed library into this app.
    cpSync(join(repositoryRoot, 'node_modules'), join(fixtureRoot, 'node_modules'), { recursive: true, dereference: true })
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', '--legacy-peer-deps'], { cwd: fixtureRoot, ...npmOptions })
    const installedPackage = join(fixtureRoot, 'node_modules', packageName)
    if (!existsSync(join(installedPackage, 'index.js')) || !existsSync(join(installedPackage, 'styles.css'))) {
      throw new Error('Fixture did not install the package public JavaScript and stylesheet entries.')
    }
    run('npm', ['run', 'typecheck'], { cwd: fixtureRoot })
    run('npm', ['run', 'build'], { cwd: fixtureRoot })
    console.log('Packed consumer fixture verified without source aliases.')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
