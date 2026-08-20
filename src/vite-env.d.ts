/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute origin of the Volt REST API, e.g. `http://localhost:4000`.
   * Optional: when unset the client runs in browser-only demo mode.
   * Public by design — never put server secrets in a `VITE_` variable.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
