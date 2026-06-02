import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { anthropicExtractPlugin } from './server/extractPlugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load ANTHROPIC_API_KEY from .env files too (in addition to the real
  // process environment). The '' prefix loads vars without the VITE_ prefix —
  // these stay server-side and are NOT exposed to client code.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), anthropicExtractPlugin(env)],
  }
})
