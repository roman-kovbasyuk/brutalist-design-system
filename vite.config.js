import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createBasicsManifest } from './src/components/design-system/foundations/basics-catalog.js'

function basicsReference() {
  const reference = () => JSON.stringify(createBasicsManifest(readFileSync(new URL('./src/components/design-system/basics/tokens.css', import.meta.url), 'utf8')), null, 2)
  return {
    name: 'basics-reference',
    configureServer(server) {
      server.middlewares.use('/design-system/basics.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.end(reference())
      })
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'design-system/basics.json', source: reference() }) },
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), basicsReference()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}', 'src/**/*.test.{ts,tsx}'],
  },
})
