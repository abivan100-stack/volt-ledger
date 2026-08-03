# Volt — Local Energy Ledger

## Tech Stack
- Vite 8 + React 18 + TypeScript 6 (strict)
- Tailwind CSS 3 (co-located component stylesheets, no inline styles)
- Zustand 5 for state management
- js-sha256 for synchronous hash chain
- Fontsource (Archivo, Instrument Serif, Spline Sans Mono)
- Lucide React icons
- Vitest for testing
- oxlint for linting

## Project Structure
- `src/lib/` — Pure logic (no React, no DOM, no store imports)
- `src/store/` — Zustand store
- `src/components/sections/` — Page-section components with co-located CSS
- `src/components/ui/` — Reusable UI primitives (ErrorBoundary, etc.)
- `src/pages/` — VoltPage.tsx (landing), LedgerPage.tsx (live ledger)
- `src/theme/` — Design tokens + global stylesheet

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Type-check + production build
- `npm run lint` — oxlint
- `npm test` — Vitest (tests co-located under `src/lib/__tests__/`, `src/store/__tests__/`, `src/hooks/__tests__/`)
- `npm run test:watch` — Vitest watch mode
- `npm run test:coverage` — Vitest with coverage

## Key Conventions
- Logic stays pure: lib/*.ts must not import React, store, or touch DOM
- Every component gets its own co-located .css file (no inline styles)
- Simulation is deterministic: pure functions of (dayType, hour, householdId)
- hashChain.ts is load-bearing — do not modify unless explicitly planned

## State Shape
- `useEnergyStore` holds all simulation state: households, chain, dayType, simMinute, metrics
- `dailyBreakdown` is computed in setDayType/start (not a separate hook)
- `seededUnit` provides deterministic randomness for all stochastic calculations

## Testing
- Lib tests are in `src/lib/__tests__/`; store-action tests in `src/store/__tests__/`; hook tests in `src/hooks/__tests__/` (happy-dom, `@testing-library/react`)
- Each lib module has a corresponding test file (9 lib files + 4 store/hook files, 139 tests)
- Store tests reset the singleton store to its pristine state before each case
