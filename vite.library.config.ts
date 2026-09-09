import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-library',
    emptyOutDir: true,
    lib: { entry: fileURLToPath(new URL('./src/components/design-system/index.ts', import.meta.url)), formats: ['es'], fileName: 'index' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react', 'radix-ui'] },
  },
})
