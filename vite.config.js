import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: 'src/index.js', formats: ['es', 'cjs'], fileName: (format) => `index.${format}.js` },
    rollupOptions: { external: ['react', 'react-dom', 'lucide-react'] },
  },
  server: { port: 4174 },
})
