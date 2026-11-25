import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    // e2e/ holds the Playwright tests (`npm run test:e2e`), not Vitest ones.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
