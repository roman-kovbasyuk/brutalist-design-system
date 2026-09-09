import { existsSync, readFileSync } from 'node:fs'
const required = ['dist-library/index.js', 'dist-library/index.d.ts', 'dist-library/styles.css', 'dist-library/package.json']
const missing = required.filter(path => !existsSync(path))
if (missing.length) throw new Error(`Missing library files: ${missing.join(', ')}`)
const manifest = JSON.parse(readFileSync('dist-library/package.json', 'utf8'))
if (manifest.name !== 'brutalist-design-system' || !manifest.exports['./styles.css']) throw new Error('Library manifest has incomplete public exports.')
console.log('Local library artifact verified.')
