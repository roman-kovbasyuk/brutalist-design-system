import { lstat, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'parse5'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const sourceMapArtifact = /\.map(?:\.[A-Za-z0-9_-]+)*$/i
const assetElements = new Map([
  ['audio', ['src']],
  ['embed', ['src']],
  ['iframe', ['src']],
  ['img', ['src', 'srcset']],
  ['input', ['src']],
  ['image', ['href', 'xlink:href']],
  ['object', ['data']],
  ['script', ['src']],
  ['source', ['src', 'srcset']],
  ['track', ['src']],
  ['use', ['href', 'xlink:href']],
  ['video', ['poster', 'src']],
])
const assetLinkRelations = new Set([
  'apple-touch-icon', 'icon', 'manifest', 'modulepreload', 'preload', 'stylesheet',
])

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
      if (sourceMapArtifact.test(filePath)) throw new Error(`Build output must not contain source maps: ${filePath}`)
      files.add(filePath)
    } else {
      throw new Error(`Build output must contain regular files only: ${filePath}`)
    }
  }
}

async function requireFile(root, files, file) {
  if (!files.has(file)) throw new Error(`Build output is missing ${file}`)
  return readFile(join(root, file), 'utf8')
}

function isExternalReference(reference) {
  return reference.startsWith('#')
    || reference.startsWith('//')
    || /^(?:data|blob|https?):/i.test(reference)
}

function validateReference({ reference, document, files }) {
  const value = reference.trim()
  if (!value) throw new Error(`${document} contains a malformed asset reference: ${reference}`)
  if (isExternalReference(value)) return
  if (!value.startsWith('/')) {
    const expectedRoot = document.startsWith('docs/') ? '/docs/' : '/assets/'
    throw new Error(`${document} contains a relative asset reference; expected a root-relative ${expectedRoot} asset: ${reference}`)
  }
  if (/[\\\0-\x1f\x7f]/.test(value)) throw new Error(`${document} contains a malformed asset reference: ${reference}`)

  const encodedPathname = value.split(/[?#]/, 1)[0]
  let pathname = encodedPathname
  try {
    for (let depth = 0; depth < 8; depth += 1) {
      const decoded = decodeURIComponent(pathname)
      if (decoded === pathname) break
      pathname = decoded
      if (depth === 7) throw new Error('Asset reference exceeds the decoding limit')
    }
  } catch (error) {
    throw new Error(`${document} contains a malformed asset reference: ${reference}`, { cause: error })
  }
  if (/[\\\0-\x1f\x7f]/.test(pathname)) throw new Error(`${document} contains a malformed asset reference: ${reference}`)
  if (pathname.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`${document} contains asset traversal: ${reference}`)
  }
  if (encodedPathname.includes('%')) throw new Error(`${document} contains a malformed asset reference: ${reference}`)
  if (sourceMapArtifact.test(pathname)) throw new Error(`${document} references a source map: ${reference}`)

  const expectedRoot = document.startsWith('docs/') ? '/docs/' : '/assets/'
  if (!pathname.startsWith(expectedRoot)) {
    throw new Error(`${document} contains an asset reference under the wrong static root: ${reference}`)
  }

  const file = pathname.slice(1)
  if (!files.has(file)) throw new Error(`${document} references missing build asset ${reference}`)
}

function srcsetReferences(value) {
  return value.split(',').map((candidate) => candidate.trim().split(/\s+/, 1)[0]).filter(Boolean)
}

function walkHtml(node, references) {
  if (node.tagName) {
    const attributes = new Map((node.attrs ?? []).map(({ name, value }) => [name.toLowerCase(), value]))
    const names = assetElements.get(node.tagName) ?? []
    for (const name of names) {
      const value = attributes.get(name)
      if (value === undefined) continue
      references.push(...(name === 'srcset' ? srcsetReferences(value) : [value]))
    }
    if (node.tagName === 'link') {
      const relations = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      if (relations.some((relation) => assetLinkRelations.has(relation)) && attributes.has('href')) {
        references.push(attributes.get('href'))
      }
    }
    if (attributes.has('style')) references.push(...cssReferences(attributes.get('style'), 'inline style'))
    if (node.tagName === 'style') {
      const source = (node.childNodes ?? []).map((child) => child.value ?? '').join('')
      references.push(...cssReferences(source, 'inline style'))
    }
  }
  for (const child of node.childNodes ?? []) walkHtml(child, references)
}

function parsedFunctionReference(node) {
  const content = valueParser.stringify(node.nodes).trim()
  if (!content) return ''
  if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
    return content.slice(1, -1)
  }
  return content
}

function cssValueReferences(value) {
  const references = []
  valueParser(value).walk((node) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'url') references.push(parsedFunctionReference(node))
  })
  return references
}

function cssReferences(source, document) {
  let root
  try {
    root = postcss.parse(source, { from: document })
  } catch (error) {
    throw new Error(`Invalid CSS in ${document}`, { cause: error })
  }
  const references = []
  root.walkDecls((declaration) => references.push(...cssValueReferences(declaration.value)))
  root.walkAtRules(/^import$/i, (rule) => {
    const parsed = valueParser(rule.params)
    const first = parsed.nodes.find((node) => node.type !== 'space' && node.type !== 'comment')
    if (first?.type === 'string') references.push(first.value)
    else if (first?.type === 'function' && first.value.toLowerCase() === 'url') references.push(parsedFunctionReference(first))
  })
  return references
}

function htmlReferences(source, document) {
  let tree
  try {
    tree = parse(source, { sourceCodeLocationInfo: true })
  } catch (error) {
    throw new Error(`Invalid HTML in ${document}`, { cause: error })
  }
  const references = []
  walkHtml(tree, references)
  return references
}

function verifyReferences({ references, document, files }) {
  for (const reference of references) validateReference({ reference, document, files })
}

export async function verifyBuildArtifacts(staticRoot = defaultRoot) {
  const root = resolve(staticRoot)
  const files = new Set()
  await collectFiles(root, root, files)

  await requireFile(root, files, 'index.html')
  await requireFile(root, files, 'docs/index.html')
  await requireFile(root, files, 'docs/404.html')

  const nestedDocsPage = [...files]
    .filter((file) => file.startsWith('docs/') && file.endsWith('.html') && !['docs/index.html', 'docs/404.html'].includes(file))
    .sort()[0]
  if (!nestedDocsPage) throw new Error('Build output is missing a representative nested docs HTML page')

  for (const document of [...files].sort()) {
    if (document.endsWith('.html')) {
      const source = await readFile(join(root, document), 'utf8')
      const references = htmlReferences(source, document)
      verifyReferences({ references, document, files })
      const requiredRoot = document === 'index.html' ? '/assets/' : (document === 'docs/index.html' ? '/docs/' : undefined)
      if (requiredRoot && !references.some((reference) => reference.trim().startsWith(requiredRoot))) {
        throw new Error(`${document} must reference at least one root-relative ${requiredRoot} asset`)
      }
    } else if (document.endsWith('.css')) {
      const source = await readFile(join(root, document), 'utf8')
      verifyReferences({ references: cssReferences(source, document), document, files })
    }
  }

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
