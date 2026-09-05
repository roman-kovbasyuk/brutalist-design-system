import { execFileSync } from 'node:child_process'
import { verifyBuildArtifacts } from './verify-build.mjs'

execFileSync('vite', ['build'], { stdio: 'inherit' })
execFileSync('vitepress', ['build', 'docs-site', '--outDir', 'dist/docs'], { stdio: 'inherit' })
await verifyBuildArtifacts()
