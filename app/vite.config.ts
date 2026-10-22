import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './': shampoe.com will serve this build under a path prefix (stripped), so every asset URL
// must be relative.
export default defineConfig({
  base: './',
  plugins: [react()],
})
