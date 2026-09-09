import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

function bundleStylesheet(path, imported = new Set()) {
  const absolutePath = resolve(path)
  if (imported.has(absolutePath)) throw new Error(`Circular stylesheet import: ${absolutePath}`)
  imported.add(absolutePath)
  const stylesheet = readFileSync(absolutePath, 'utf8')
  return stylesheet.replace(/^@import\s+['"](.+?)['"];\s*$/gm, (_, importPath) => {
    if (!importPath.startsWith('.')) return _
    return bundleStylesheet(resolve(dirname(absolutePath), importPath), imported)
  })
}

execFileSync('npx', ['vite', 'build', '--config', 'vite.library.config.ts'], { stdio: 'inherit' })
execFileSync('npx', ['tsc', '-p', 'tsconfig.library.json'], { stdio: 'inherit' })
mkdirSync('dist-library', { recursive: true })
writeFileSync('dist-library/styles.css', bundleStylesheet('src/components/design-system/styles.css'))
writeFileSync('dist-library/styles.css.d.ts', 'declare const stylesheet: string\nexport default stylesheet\n')
const root = JSON.parse(readFileSync('package.json', 'utf8'))
writeFileSync('dist-library/package.json', JSON.stringify({
  name: 'brutalist-design-system', version: root.version, private: true, type: 'module',
  exports: {
    '.': { types: './index.d.ts', import: './index.js' },
    './styles.css': { types: './styles.css.d.ts', default: './styles.css' },
  },
  sideEffects: ['*.css'], peerDependencies: { react: '>=19', 'react-dom': '>=19' },
  dependencies: { 'lucide-react': root.dependencies['lucide-react'], 'radix-ui': root.dependencies['radix-ui'] },
}, null, 2))
