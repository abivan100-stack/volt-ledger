# Volt — Local Energy Ledger

## Tech Stack
- Vite 8 + React 18 + TypeScript 6 (strict)
- Tailwind CSS 3 (co-located component stylesheets, no inline styles)
- Zustand 5 for state management
- js-sha256 for synchronous hash chain
- Fontsource (Archivo, Instrument Serif, Spline Sans Mono)
- Vitest for testing
- oxlint for linting

## Project Structure
- `src/api/` — Typed REST client for the Volt API (fetch, cookies, ApiError); the only layer that talks to the backend
- `src/lib/` — Pure logic (no React, no DOM, no store imports)
- `src/store/` — Zustand stores (`useEnergyStore` simulation, `useSessionStore` authentication, `useOrganisationStore` organisation selection, `useMembershipStore` members of the selected organisation)
- `src/components/account/` — Account/session components with co-located CSS
- `src/components/sections/` — Page-section components with co-located CSS
- `src/components/ui/` — Reusable UI primitives (ErrorBoundary, etc.)
- `src/pages/` — VoltPage.tsx (landing), LedgerPage.tsx (live ledger), AccountPage.tsx (sign in/up), InvitationAcceptPage.tsx (`/invite/accept`)
- `src/theme/` — Design tokens + global stylesheet
- `src/utils/` — Framework-free helpers (animateProgress, etc.)

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Type-check + production build
- `npm run lint` — oxlint
- `npm test` — Vitest (tests co-located under `src/lib/__tests__/`, `src/api/__tests__/`, `src/store/__tests__/`, `src/hooks/__tests__/`)
- `npm run test:integration` — integration suite against a real MongoDB replica set; needs `MONGODB_TEST_URI` and `MONGODB_TEST_DB_NAME` and fails without them
- `npm run test:watch` — Vitest watch mode
- `npm run test:coverage` — Vitest with coverage

## Key Conventions
- Logic stays pure: lib/*.ts must not import React, store, or touch DOM
- Dependencies run one way: `store/` may import `api/`, never the reverse — the API layer announces 401s through `api/unauthenticated.ts` instead of calling the store
- `server/src/http/responses.ts` schemas are `.strict()` on purpose: the published document says `additionalProperties: false`, so the contract tests must reject an undocumented extra field rather than let Zod strip it
- `docs/openapi.json` is generated, never hand-edited: run `npm run openapi:write` after any contract change and `npm run openapi:check` to verify it (CI runs the check)
- Every `/api/v1` request schema lives in `server/src/http/schemas.ts` — handlers and the OpenAPI document read the same objects, so the published contract cannot drift from runtime validation
- Network code lives in `src/api/`, never in `src/lib/`; the browser learns one server address, `VITE_API_BASE_URL`, and no server secret is ever exposed to a `VITE_` variable
- Every component gets its own co-located .css file (no inline styles)
- Simulation is deterministic: every value is a pure function of (dayType, hour, householdId), and stochastic variation flows only through `seededUnit` (an FNV-1a hash folded into [0,1)) — never `Math.random()` or `performance.now()`
- `lib/permissions.ts` decides what the UI offers; it never replaces the API's own role checks, so keep the two in step
- Zustand selectors must not build a new object/array (`state.runs.filter(...)`) — the changed identity re-renders forever; select the value and derive in the body
- hashChain.ts is load-bearing — do not modify unless explicitly planned

## State Shape
- `useEnergyStore` holds all simulation state: households, chain, dayType, simMinute, metrics
- `dailyBreakdown` is computed in setDayType/start (not a separate hook)
- `seededUnit` provides deterministic randomness for all stochastic calculations
- `useOrganisationStore` holds the organisation list and current selection, and resets when a session ends
- `useSessionStore` holds authenticated-session state only; it never gates the demo simulation, and with no `VITE_API_BASE_URL` it settles on `anonymous` without a network call

## Testing
- Lib tests are in `src/lib/__tests__/`; API-client tests in `src/api/__tests__/`; store-action tests in `src/store/__tests__/`; hook tests in `src/hooks/__tests__/`; component tests in `src/components/sections/__tests__/` (happy-dom, `@testing-library/react`)
- Each lib module has a corresponding test file; test counts evolve, so treat `npm test` output as authoritative
- API-client tests run in the default node environment and inject a fake `fetch`; they never hit a real server
- RTL auto-cleanup is NOT enabled (no globals): call `cleanup()` in `afterEach` for every component/hook test, or timers and effects leak into the next case
- Integration tests (`*.integration.test.ts`) are excluded from `test:api` and run only via `test:integration`, which disables file parallelism because they share one database and empty it between tests
- Store tests reset the singleton store to its pristine state before each case; in-flight request handles live in store state (not module variables) so that reset actually clears them
- No jest-dom: assert with `.textContent`, `.getAttribute()`, `toBeTruthy()`/`toBeNull()` rather than `toBeInTheDocument()`

## Git workflow
- `main` is the default branch; `backend` is the active API and worker integration branch
- `codex/backend-foundation` was fully contained in `backend` and retired; do not recreate it
- Start scoped backend work from `origin/backend`, for example `git switch -c codex/<topic> origin/backend`
- Before retiring a branch, prove it is an ancestor of the surviving branch, check that no open pull request uses it, and never switch, merge, or delete around uncommitted work without preserving it first

## Agent skills

### Issue tracker

Issues live in GitHub Issues and are managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Uses a single-context layout with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
