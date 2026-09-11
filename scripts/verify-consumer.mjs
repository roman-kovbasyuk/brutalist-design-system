import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureSource = join(repositoryRoot, 'fixtures/package-consumer')
const packageName = 'brutalist-design-system'

export function createFixtureManifest(tarballPath, rootManifest) {
  return {
    name: 'design-system-package-consumer-fixture',
    private: true,
    type: 'module',
    scripts: {
      build: 'vite build',
      typecheck: 'tsc --noEmit',
      verify: 'node verify.mjs',
    },
    dependencies: {
      [packageName]: `file:${tarballPath}`,
      react: rootManifest.dependencies.react,
      'react-dom': rootManifest.dependencies['react-dom'],
    },
    devDependencies: {
      ...Object.fromEntries(['@types/react', '@types/react-dom', '@vitejs/plugin-react', 'typescript', 'vite']
        .map(name => [name, rootManifest.devDependencies[name]])),
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
  const npmOptions = { env: { ...process.env, npm_config_cache: join(workspace, 'npm-cache') } }
  try {
    run('npm', ['pack', distLibrary, '--pack-destination', workspace, '--ignore-scripts'], { cwd: repositoryRoot, ...npmOptions })
    const libraryManifest = JSON.parse(read(join(distLibrary, 'package.json')))
    const tarball = join(workspace, `${packageName}-${libraryManifest.version}.tgz`)
    if (!existsSync(tarball)) throw new Error('npm pack did not create the library tarball.')
    cpSync(fixtureSource, fixtureRoot, { recursive: true })
    assertFixtureUsesPublicApi(fixtureRoot)
    const rootManifest = JSON.parse(read(join(repositoryRoot, 'package.json')))
    writeFileSync(join(fixtureRoot, 'package.json'), `${JSON.stringify(createFixtureManifest(tarball, rootManifest), null, 2)}\n`)

    // A fresh install checks packed contents and dependency declarations. It intentionally
    // requires registry access: copying host modules would hide missing dependencies.
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: fixtureRoot, ...npmOptions })
    const installedPackage = join(fixtureRoot, 'node_modules', packageName)
    if (!existsSync(join(installedPackage, 'index.js')) || !existsSync(join(installedPackage, 'styles.css'))) {
      throw new Error('Fixture did not install the package public JavaScript and stylesheet entries.')
    }
    run('npm', ['run', 'typecheck'], { cwd: fixtureRoot })
    run('npm', ['run', 'verify'], { cwd: fixtureRoot })
    run('npm', ['run', 'build'], { cwd: fixtureRoot })
    console.log('Packed consumer fixture verified without source aliases.')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
