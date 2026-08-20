import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The integration suite, run against a real MongoDB by `npm run test:integration`.
 *
 * Kept separate from `vitest.config.ts` for two reasons. `VOLT_REQUIRE_INTEGRATION`
 * turns a missing `MONGODB_TEST_URI` into a failure here, so a staging run cannot
 * pass while testing nothing. And `fileParallelism` is off because every file
 * shares one database and empties it between tests — running two files at once
 * would let one file's cleanup delete another's fixtures.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    env: { VOLT_REQUIRE_INTEGRATION: '1' },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
