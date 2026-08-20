import { configDefaults, defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests need a real MongoDB and share one database, so they run
    // only through `npm run test:integration`, which disables file parallelism.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
})
