import { lstat, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

async function collectFiles(directory, root, files) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    throw new Error(`Build output directory is unavailable: ${root}`, { cause: error })
  }

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name)
    const filePath = relative(root, absolutePath).split(sep).join('/')
    const details = await lstat(absolutePath)
    if (details.isSymbolicLink()) throw new Error(`Build output must not contain symbolic links: ${filePath}`)
    if (entry.name.startsWith('.')) throw new Error(`Build output must not contain dotfiles: ${filePath}`)
    if (details.isDirectory()) {
      await collectFiles(absolutePath, root, files)
    } else if (details.isFile()) {
      if (filePath.endsWith('.map')) throw new Error(`Build output must not contain source maps: ${filePath}`)
      files.add(filePath)
    }
  }
}

async function requireFile(root, files, file) {
  if (!files.has(file)) throw new Error(`Build output is missing ${file}`)
  return readFile(join(root, file), 'utf8')
}

function assetReferences(html) {
  return [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1])
}

function verifyReferences({ files, references, prefix, document }) {
  const matching = references.filter((reference) => reference.startsWith(prefix))
  if (matching.length === 0) throw new Error(`${document} must reference at least one root-relative ${prefix} asset`)
  for (const reference of matching) {
    const file = reference.slice(1).split(/[?#]/, 1)[0]
    if (!files.has(file)) throw new Error(`${document} references missing build asset ${reference}`)
  }
}

export async function verifyBuildArtifacts(staticRoot = defaultRoot) {
  const root = resolve(staticRoot)
  const files = new Set()
  await collectFiles(root, root, files)

  const spaHtml = await requireFile(root, files, 'index.html')
  const docsHtml = await requireFile(root, files, 'docs/index.html')
  await requireFile(root, files, 'docs/404.html')

  const nestedDocsPage = [...files]
    .filter((file) => file.startsWith('docs/') && file.endsWith('.html') && !['docs/index.html', 'docs/404.html'].includes(file))
    .sort()[0]
  if (!nestedDocsPage) throw new Error('Build output is missing a representative nested docs HTML page')

  verifyReferences({ files, references: assetReferences(spaHtml), prefix: '/assets/', document: 'SPA index.html' })
  verifyReferences({ files, references: assetReferences(docsHtml), prefix: '/docs/assets/', document: 'Docs index.html' })

  const spaAssetCount = [...files].filter((file) => file.startsWith('assets/')).length
  const docsAssetCount = [...files].filter((file) => file.startsWith('docs/assets/')).length
  if (spaAssetCount === 0 || docsAssetCount === 0) throw new Error('Build output must include SPA and docs assets')

  return Object.freeze({
    root,
    spaIndex: 'index.html',
    docsIndex: 'docs/index.html',
    nestedDocsPage,
    spaAssetCount,
    docsAssetCount,
  })
}

async function main() {
  const result = await verifyBuildArtifacts(process.argv[2] || defaultRoot)
  process.stdout.write(`Verified SPA, docs, ${result.spaAssetCount} SPA assets, and ${result.docsAssetCount} docs assets\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
