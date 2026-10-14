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
    env: {
      MONGODB_URI: 'mongodb://127.0.0.1:27017',
      MONGODB_DB_NAME: 'volt_test',
      BETTER_AUTH_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      BETTER_AUTH_URL: 'http://localhost:4000',
      WEB_ORIGIN: 'http://localhost:5173',
    },
    envDir: false,
  },
});