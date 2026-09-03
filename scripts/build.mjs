import { execFileSync } from 'node:child_process'

execFileSync('vite', ['build'], { stdio: 'inherit' })
execFileSync('vitepress', ['build', 'docs-site', '--outDir', 'dist/docs'], { stdio: 'inherit' })
