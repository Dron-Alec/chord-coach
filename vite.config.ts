import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // works on GitHub Pages subpaths
  plugins: [react()],
})
