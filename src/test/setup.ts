import { beforeEach, vi } from 'vitest'

// Component and store tests must never inherit a developer's live API URL from
// .env. Individual API configuration tests opt in with vi.stubEnv instead.
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '')
})
