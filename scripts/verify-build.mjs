import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'parse5'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { assertStaticPathname } from '../shared/staticPathPolicy.js'
import { openStaticBuild } from '../server/staticFiles.js'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
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

async function requireFile(build, files, file) {
  if (!files.has(file)) throw new Error(`Build output is missing ${file}`)
  const entry = build.getFile(file)
  const content = Buffer.allocUnsafe(entry.size)
  let offset = 0
  while (offset < entry.size) {
    const { bytesRead } = await entry.handle.read(content, offset, entry.size - offset, offset)
    if (bytesRead === 0) throw new Error(`Build snapshot ended before its recorded length: ${file}`)
    offset += bytesRead
  }
  return content.toString('utf8')
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
  const pathname = value.split(/[?#]/, 1)[0]
  try {
    assertStaticPathname(pathname, { leadingSlash: true })
  } catch (error) {
    if (error.reason === 'dot segment or separator') {
      throw new Error(`${document} contains asset traversal: ${reference}`, { cause: error })
    }
    if (error.reason === 'source map') throw new Error(`${document} references a source map: ${reference}`, { cause: error })
    throw new Error(`${document} contains a malformed asset reference (non-canonical): ${reference}`, { cause: error })
  }
  if (pathname.endsWith('.html')) {
    throw new Error(`${document} references an HTML path that is not served directly: ${reference}`)
  }

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

export async function verifyBuildArtifacts(staticRoot = defaultRoot, { openBuild = openStaticBuild } = {}) {
  const root = resolve(staticRoot)
  const build = await openBuild(root)
  try {
    const files = new Set(build.files)

    await requireFile(build, files, 'index.html')
    await requireFile(build, files, 'docs/index.html')
    await requireFile(build, files, 'docs/404.html')

    const nestedDocsPage = [...files]
      .filter((file) => file.startsWith('docs/') && file.endsWith('.html') && !['docs/index.html', 'docs/404.html'].includes(file))
      .sort()[0]
    if (!nestedDocsPage) throw new Error('Build output is missing a representative nested docs HTML page')

    for (const document of [...files].sort()) {
      if (document.endsWith('.html')) {
        const source = await requireFile(build, files, document)
        const references = htmlReferences(source, document)
        verifyReferences({ references, document, files })
        const requiredRoot = document === 'index.html' ? '/assets/' : (document === 'docs/index.html' ? '/docs/' : undefined)
        if (requiredRoot && !references.some((reference) => reference.trim().startsWith(requiredRoot))) {
          throw new Error(`${document} must reference at least one root-relative ${requiredRoot} asset`)
        }
      } else if (document.endsWith('.css')) {
        const source = await requireFile(build, files, document)
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
  } finally {
    await build.close()
  }
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
