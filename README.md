# Volt

A transparent, tamper-evident ledger for peer-to-peer rooftop-solar energy trading.

Built for the **Open Energy Challenge 2026**. All data is simulated — nothing real was metered or billed.

![Volt landing page](screenshots/volt-hero.png)

---

## Problem

In India, the grid buys surplus rooftop solar at roughly ₹3.00/kWh and resells it next door at ₹8.00/kWh. That ₹5.00 spread — about 62% of the retail price — leaves the neighbourhood for a balance sheet three districts away, even though the electron only travelled forty metres.

Volt clears the same trade at a community rate near ₹5.50/kWh. The seller earns more, the buyer pays less, and a small fee sustains the network. The value stays on the street.

## How It Works

1. **Generate** — Households with rooftop solar panels produce surplus energy during daylight hours.
2. **Log** — Every trade is recorded to a shared SHA-256 hash chain, computed live in the browser. Each block's seal is `SHA-256(previous seal + entry payload)`, making the chain tamper-evident: any modification to a past entry breaks verification for that block and every subsequent block.
3. **Settle** — Neighbours buy and sell at a community rate, bypassing the grid's markup.

## Features

### Landing Page (`/`)

- Animated neighbourhood network visualising energy flow between surplus and deficit households
- Interactive spread chart comparing grid economics against Volt's community rate
- Three-step explainer covering Generate, Log, and Settle
- Trade-off analysis addressing why a hash chain, not a plain database

### Live Ledger (`/ledger`)

A simulated solar afternoon on the Nolambur microgrid (Chennai):

- **Live energy map** — Site plan of ten rooftops on a shared bus, with energy packets routed from sellers to buyers. Click any house for its full dossier.
- **The street** — Ten household cards updating in real time as they export and import energy.
- **The hash chain** — Every trade sealed into a SHA-256 chain, computed synchronously in the browser via `js-sha256`.
- **Per-household dossier** — Rooftop specifications, generation-versus-demand curves, and the day's trade activity.
- **Day-type selector** — Switch between Sunny Weekday, Cloudy, Weekend, and Heatwave to see how conditions affect generation, demand, and trading.
- **Tamper test** — Click any kWh figure and retype it. That row and every row after it immediately fail verification, an `INTEGRITY VOID` stamp appears, and settlement halts. Restore original values to re-verify the chain.
- **Ledger export** — Download the full chain as CSV, or as a formatted PDF report (summary stats, chain status, paginated table), from the chain header.
- **Shareable scenarios** — `/ledger?day=<dayType>&hour=<0-23>` opens the ledger pre-set to a given day type and simulation start hour; picking a day type from the selector updates the URL to match.

### Metrics Dashboard

- **Carbon Avoided** — Kilograms of CO₂ avoided by trading locally instead of drawing from the grid, with a human-scale driving-distance equivalence.
- **Grid Dependence** — Breakdown of demand sources: solar self-consumption, battery discharge, local trade, and grid import. Four contributions sum to 100%.
- **Neighbourhood Autonomy Score** — Percentage of total demand met without grid import. Always the complement of grid dependence.
- **Fairness Score** — Distribution of net trading benefit across all ten households, with best-off and worst-off highlighted.

### Proof Inspector

Live hash recomputation for any selected transaction in the ledger. Shows the block's stored hash, the hash recomputed from current contents, the previous block's hash, and an explicit match/mismatch status. When a block is tampered with, the inspector displays the exact point of failure and the downstream cascade through subsequent blocks.

## Screenshots

| | |
|---|---|
| ![The hash chain](screenshots/ledger-chain.png) | ![Household dossier](screenshots/dossier.png) |
| Tamper-evident hash chain | Per-household dossier |

## Tech Stack

| Layer | Technology |
|---|---|
| Build tool | Vite 8 |
| Language | TypeScript 6 (strict mode) |
| UI framework | React 18 |
| Styling | Tailwind CSS 3 with co-located component stylesheets |
| State management | Zustand 5 |
| Animation | Custom rAF tween (`src/utils/animateProgress.ts`) |
| Hashing | js-sha256 (synchronous, in-browser) |
| PDF export | jsPDF + jspdf-autotable, generated client-side |
| Fonts | Fontsource (Archivo, Instrument Serif, Spline Sans Mono) |
| Linting | oxlint |

## Getting Started

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check + production build
npm run preview        # preview production build locally
npm run lint           # lint with oxlint
npm test               # run the client test suite once (663 tests)
npm run test:watch     # test suite in watch mode
npm run test:coverage  # test suite with coverage report
```

### Backend API and simulation worker

The backend uses the `server/.env` values for MongoDB, Better Auth, and Resend. Run the REST API and simulation worker as separate processes so queued Monte Carlo runs are executed outside request-response limits:

```bash
npm run dev:api       # REST API on API_HOST/API_PORT
npm run dev:worker    # claims queued runs and persists completed outcomes
```

The API queues a run with `POST /api/v1/organisations/:organisationId/simulations`, exposes status through the corresponding `GET` route, and serves completed interval and summary results from `/results`. Each organisation has a UTC daily run quota configured with `SIMULATION_DAILY_RUN_LIMIT` (default `100`); members can inspect usage through `/simulations/quota`, and exhausted queues receive `429` with `Retry-After`. The current owner can transfer ownership to an existing active member through `/ownership/transfer`; the change atomically demotes the previous owner to admin and is audited. The owner can archive an organisation with `DELETE /api/v1/organisations/:organisationId`; active access and working simulation data are soft-deleted in one transaction while ledger and audit history remain retained. Owners and admins can inspect the bounded organisation audit stream through `/audit-events`, optionally filtering by `action` and following its opaque `cursor`/`nextCursor` pagination. An owner or admin can accept one completed outcome through `/simulations/:runId/settlement`; the server then appends one immutable, hash-linked event per household. Members can inspect those events through `/ledger`, while owners/admins can append signed correction deltas through `/ledger/adjustments` without editing history. Settlement energy is the accepted outcome's synthetic `exportedKwh`, and retries are idempotent. A run that keeps failing is not retried forever: every claim, including a stale-lease reclaim, increments the run's attempt counter, and a run that exceeds `SIMULATION_MAX_ATTEMPTS` (default `5`) is failed with `SIMULATION_MAX_ATTEMPTS_EXCEEDED` before any work is attempted, which frees the queue behind it and makes the problem visible. The simulation worker also revokes expired pending invitations every 60 seconds by default while retaining their records. All run inputs are frozen and replayable from their seed, model version, and input digest; data remains synthetic and is not meter-backed.

Members can read the backlog through `GET /api/v1/organisations/:organisationId/simulations/queue`, which returns how many runs are queued and running, how long the longest-waiting one has been queued, and whether a worker is draining it. The two readings are answered together because neither is conclusive alone: a backlog with a `live` worker is a busy system, and the same backlog with a `stale` worker is an outage. The worker half is deliberately coarse - `live`, `stale`, `stopped`, or `unknown`, with the time it was last heard from - and carries no worker identity, failure counts, or error codes, because every member can read it.

The worker has no HTTP surface of its own, so it reports its condition instead: it writes a heartbeat under `WORKER_ID` (default `volt-worker`) carrying its status, start time, last successful poll, consecutive failures, runs processed, and last error code. Health and liveness are separate readings — a worker failing every poll is still alive and says so, a clean shutdown is recorded as stopped however old the row gets, and only silence is read as stale. The heartbeat is state rather than history, so each worker keeps one row that is rewritten in place; no free-form error text is stored, because driver failures quote connection strings. Publishing is throttled and never blocks work: a status change goes out immediately, an unchanged status is rate-limited, and a failed write is logged and dropped. See [ADR 0010](docs/adr/0010-worker-liveness-by-heartbeat.md).

Cookie-authenticated state-changing API requests must include a same-origin `Origin` or `Referer`; the API also enforces a bounded request body size.

### Client API configuration

The browser bundle learns exactly one server address, `VITE_API_BASE_URL`, set in a root `.env` (copy `.env.example`):

```bash
VITE_API_BASE_URL=http://localhost:4000
```

Anything prefixed with `VITE_` is compiled into the bundle and is public — MongoDB credentials, Better Auth secrets, and Resend keys stay in `server/.env`. Leaving `VITE_API_BASE_URL` unset builds the browser-only demo, which makes no backend calls; `isApiConfigured()` in `src/api/config.ts` reports which mode a build is in.

Session state lives in `src/store/useSessionStore.ts`, separate from the simulation store. `useRestoreSession()` restores it once on mount and settles on `anonymous` without any network call when no API is configured, so the demo routes behave exactly as before. A session that disappears mid-visit is reported through `expire()`, which distinguishes an expired session from a deliberate sign-out; any route answering `401` triggers that centrally, so no caller has to remember to handle it.

### Account page (`/account`)

Sign in, create an account, and sign out. The route is always present, but the header only links to it once
`VITE_API_BASE_URL` is set — a demo build has no backend to sign in to, so the existing chrome is left untouched and the
page itself says so rather than offering a form that cannot work. The panel covers each state the session can be in:
checking, signed out, signed in, expired, and "could not tell" with a retry.

The simulation panel shows the organisation's UTC daily allowance, queues runs, and displays the per-household
outcome bands of a completed one. Because a run is executed by a separate worker rather than in the request, the panel
polls only while a run is still `queued` or `running` and stops as soon as every run has settled — an idle organisation
issues no traffic. Operators and above can queue runs; viewers get the list only. Submission is disabled once the
allowance is spent, and a `429` reports the exhausted quota. A run that has not finished reads as pending rather than
failed. Everything shown is synthetic, and the panel says so.

The ledger panel shows the organisation's append-only settlement chain with the server's own integrity verdict on it —
`CHAIN VERIFIED`, or `INTEGRITY VOID` raised as an alert. Every member can read it. Owners and admins can accept one
completed run's outcome, which appends one immutable event per household, and can append signed corrections against an
accepted event. Nothing in the client edits or deletes an event: a correction is a new event carrying a delta, and the
panel says so next to the form. Acceptance is idempotent, a repeat reports that nothing was appended, and an adjustment
requires an idempotency key so a retry cannot double-count. After either write the whole slice is re-read, so the
integrity report always describes what is actually stored rather than something inferred locally.

Owners and admins can also read the organisation's audit history. Paging follows the API's opaque cursor and appends,
so the list grows into one continuous history rather than jumping between pages, and applying an action filter starts a
fresh page because an existing cursor belongs to the previous filter. A failed page keeps what has already loaded. The
panel notes that audit history is retained for provenance, including after an organisation is archived.

Archiving is offered to the owner alone, behind a disclosure, and requires the organisation's identifier to be typed
out before it will run — it is soft-deletion, but there is no undo from Volt. The warning states exactly what goes
(every member's access, plus simulation runs and results) and what stays (ledger and audit history, retained for
provenance).

### Accepting an invitation (`/invite/accept`)

Invitation emails link to `${WEB_ORIGIN}/invite/accept?token=…`. The page establishes who is signed in, shows which
address the invitation will be matched against, and accepts only on an explicit click — following a link should never
silently join somebody to an organisation. It reports each refusal the server distinguishes: a mismatched address, an
expired or unknown invitation, an unverified email, and an existing membership.

Owners and admins can also issue and revoke invitations. The role choices exclude owner entirely — ownership moves
only through a transfer — and an admin is offered neither the ability to invite another admin nor to revoke an admin
invitation, matching the API. Creating an invitation returns `202` after the invitation and an encrypted delivery
record are committed atomically; the worker sends the message with a stable Resend idempotency key and retries
transient provider failures with bounded leases and backoff. The panel reports that the invitation is queued while it
remains pending until accepted or revoked.
Revoking marks the record revoked rather than deleting it, because invitation history is retained.

The member list shows every active member of the selected organisation and only the controls the caller's role
permits: an owner may reassign or remove anyone but the owner, an admin may reach operators and viewers and cannot mint
another admin, and operators and viewers get a read-only list. Nobody gets controls against their own membership.
Handing over ownership is confirmed before it is sent, because it demotes the acting owner to admin in the same
transaction. `canManageMembership` in `src/lib/permissions.ts` mirrors the API's `isRoleManagementAllowed`, which
re-checks every case.

Once signed in, the page lists the organisations you belong to, shows the role you hold in the selected one, and
creates new ones. The identifier is derived from the name by `src/lib/slug.ts` and stops tracking it the moment you
edit it by hand; it is validated against the same rules the API applies before the request is sent.

Email sign-in and sign-up go through Better Auth (`src/api/auth.ts`). Because the API sets `requireEmailVerification`, sign-up does **not** start a session — it emails a six-digit verification code — and signing in before verifying is refused with `403` while a fresh code goes out; the UI must say so rather than assume success. The code is redeemed with `verifyEmailOtp` against `/api/auth/email-otp/verify-email`, which verifies the address but returns no session, so the visitor still signs in afterwards. Codes are six digits, valid for 10 minutes, allow five wrong guesses before they are burned, and are stored hashed — a link carries its own proof, whereas a short code is only as safe as the guessing budget around it. Verification is configured by the Better Auth `emailOTP` plugin with `overrideDefaultEmailVerification`, which replaces the link sender at init, so sign-up, an unverified sign-in, and the resend endpoint all emit codes through one path. `useSessionStore.signIn()` reads the session back from `/api/v1/me` after the cookie is set instead of inventing state from the submitted credentials.

Organisations are loaded through `useOrganisationStore`, which keeps the current selection pointing at a real organisation across refreshes and clears itself when a session ends. List failures stay on the store so the selector can retry; `create` and `archive` reject to their caller so a form or confirmation dialog can show the error next to the control that caused it. `src/lib/permissions.ts` mirrors the API's role rules to decide what the UI offers — the server re-checks every one of them and remains the only authority.

The API runs on its own origin, so `src/api/client.ts` issues absolute requests with `credentials: 'include'` for the session cookie. Browsers attach `Origin` automatically, satisfying the API's CSRF check on state-changing routes. `VITE_API_BASE_URL` must point at the origin whose `WEB_ORIGIN` matches where the client is served, or CORS and the CSRF check will both reject the request. Every failure — validation, authorization, quota, transport — surfaces as one `ApiError` carrying `status`, the server's `code`, any field `issues`, and parsed `Retry-After` seconds.

### Integration tests against a real MongoDB

Most of the API suite runs against stubs. The integration suite runs against a real database, because index behaviour, transaction rollback and write races cannot be faked:

```bash
npm run test:integration
```

It needs two variables, and refuses to run without them:

```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017   # must be a REPLICA SET
MONGODB_TEST_DB_NAME=volt_test               # dedicated and disposable
```

**The URI must point at a replica set**, even a single-node one. MongoDB transactions do not work on a standalone `mongod`, and several of Volt's guarantees — transactional organisation creation, the archival cascade, ownership transfer — are transactions. Suites that need one skip themselves on a standalone server rather than failing obscurely.

**The named database is emptied between tests.** It qualifies only if its name contains `test`, differs from `MONGODB_DB_NAME`, and is not a MongoDB internal database; a name is never defaulted, because defaulting is how the wrong database gets chosen. Cleanup empties only the ten collections Volt owns rather than dropping the database, so a database that also holds something else cannot be destroyed by a misconfiguration.

If your network refuses Node's system DNS resolver — some sandboxes and corporate networks do — a `mongodb+srv://` URI fails at the SRV lookup before any connection is attempted. Set `VOLT_TEST_DNS_SERVERS=8.8.8.8,1.1.1.1` to route lookups elsewhere; it does nothing when unset.

`npm run test:api` skips these suites when the URI is absent so the ordinary suite still runs on a laptop with no database. `npm run test:integration` treats the same missing configuration as a failure, so a staging run cannot pass while testing nothing.

What it verifies: every declared index exists with its keys, uniqueness and partial filters; transactions roll back completely; the archival cascade soft-deletes access and working data while retaining ledger and audit history; soft-deleted rows disappear from every read path and free their unique slug; daily quota reservation is atomic under concurrent load and hands the last unit to exactly one caller; racing ownership transfers leave exactly one owner; a single-use invitation becomes exactly one membership under concurrent acceptance; expired invitations are revoked but retained; and settlement and adjustment are idempotent under retry, including concurrent retry.

### API contract (`docs/openapi.json`)

The API publishes a versioned OpenAPI 3.1 description of every `/api/v1` route, served unauthenticated from `/openapi.json` and committed to `docs/openapi.json` so contract changes show up in review as a diff:

```bash
npm run openapi:write   # regenerate docs/openapi.json
npm run openapi:check   # validate it, and fail if it no longer matches the code (CI runs this)
```

It is generated, never hand-edited. Request schemas come from `server/src/http/schemas.ts`, which the route handlers parse with at runtime; response schemas come from `server/src/http/responses.ts`, which the contract tests parse real responses through. Because both are the same objects the code uses, the document cannot describe an API that no longer exists — and route coverage is checked in both directions against the running Fastify app, so neither an undocumented route nor a documented phantom survives.

Each operation states its authentication, the roles permitted, and every error code that status can carry. Rules JSON Schema cannot express are written out on the operations they govern: settlement and adjustment idempotency, that a correction never modifies its target, how the opaque audit cursor behaves, and that a queued run is not a computed one. Simulation and ledger examples are included and are themselves parsed by the schemas they illustrate, so they cannot rot.

Runtime validation stays in the handlers rather than moving to Fastify route schemas — see [ADR 0009](docs/adr/0009-generated-openapi-contract.md) for why that trade was made.

## Deployment

The repository includes a Render Blueprint in `render.yaml` for the complete
runtime: the static Vite site, the public Fastify API, and the private
simulation worker. The Blueprint uses the existing MongoDB Atlas replica set;
it does not create or migrate a database. Apply it from the Render Dashboard
after pushing the file to the connected Git repository.

The worker uses Render's `starter` plan because Render does not offer free
background-worker instances; the static site and API remain on the free plan.

Fill these Dashboard values before deploying:

- `MONGODB_URI`: the existing Atlas replica-set connection string.
- `MONGODB_DB_NAME`: the production database name (the Blueprint defaults to `volt`).
- `BETTER_AUTH_SECRET`: a new random secret of at least 32 characters.
- `BETTER_AUTH_URL`: the deployed API HTTPS origin.
- `WEB_ORIGIN`: the deployed static-site HTTPS origin.
- `VITE_API_BASE_URL`: the same deployed API HTTPS origin.
- Email delivery: use either Resend (`RESEND_API_KEY` plus `EMAIL_FROM`) or
  Gmail SMTP (`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`,
  `SMTP_PASSWORD`, plus `EMAIL_FROM`). Gmail requires a Google App Password,
  not the account password; configure all four SMTP variables together. When
  SMTP is configured, Volt uses it instead of Resend, so a domain purchase is
  not required for development or small-scale testing. Resend's
  `onboarding@resend.dev` sender remains development-only and can deliver only
  to the Resend account owner.
- `VOLT_DNS_SERVERS`: leave blank when Render DNS works; set comma-separated resolvers only if Atlas SRV lookup times out.

Production startup rejects HTTP values for `BETTER_AUTH_URL` and `WEB_ORIGIN`.
Use the local HTTP defaults in `server/.env.example` only for development or
test environments.

The Blueprint prompts for the Atlas, auth, and email values on both the API and worker
because the current server environment contract is process-wide; the worker
does not expose an HTTP or authentication surface, but it must still satisfy
that shared startup schema. The worker also receives the email variables,
because it is the process that drains the durable invitation email outbox.

The API binds to Render's injected `PORT` on `0.0.0.0` and reports readiness at
`/health`. The worker has no public endpoint and should be monitored through its
persisted heartbeat. After applying the Blueprint, verify the API health check,
recent error logs, and a queued simulation before treating the deployment as
ready. See [ADR 0012](docs/adr/0012-render-api-worker-blueprint.md).

The API uses a 300-request general budget per client per minute, with separate
60-request health and 20-request authentication budgets. Render sets
`TRUST_PROXY=true` so those budgets key on the original client IP; local
development keeps proxy trust disabled.

Render does not apply repo-level security headers, so configure these on the static site (or in your serving layer) before going live:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

`style-src 'unsafe-inline'` is required — the app sets runtime CSS custom properties via inline `style` attributes. The `vercel.json` at the repo root is retained as the canonical definition of these headers (used if the project is ever hosted on Vercel); it is not read by a Render deployment.

### Known dependency advisory

`react-router-dom` 7.x currently falls inside advisory [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) (RSC-mode CSRF bypass). **This app is not affected** — it uses `BrowserRouter` with client-side rendering only, no React Server Components or SSR. No patched 7.x release exists yet; do not run `npm audit fix --force` (it downgrades to 7.11.0). Re-check on a release cadence and bump once a fixed 7.x ships.

## Project Structure

```
src/
  api/                    # Typed REST client for the Volt API (network layer, kept out of lib/)
    config.ts             #   VITE_API_BASE_URL resolution and demo-mode detection
    errors.ts             #   ApiError and status/code predicates
    client.ts             #   fetch wrapper (absolute URLs, cookie credentials, error envelope)
    session.ts            #   Session restore (/api/v1/me) and sign-out
    unauthenticated.ts    #   One-slot 401 registry the session store subscribes to
    resource.ts           #   Shared client/signal plumbing for resource modules
    organisations.ts      #   Organisation list, create, read, archive
    memberships.ts        #   Member list, role change, removal, ownership transfer
    invitations.ts        #   Invitation list, create, revoke, accept
    simulations.ts        #   Run queue, status, results, and daily quota
    ledger.ts             #   Settlement acceptance, ledger history, adjustments
    audit.ts              #   Cursor-paginated organisation audit stream
    auth.ts               #   Better Auth email sign-in and sign-up
  lib/                    # Pure logic — no React, no DOM, no store imports
    hashChain.ts          #   SHA-256 hash chain (append, validate, tamper detection)
    simulation.ts         #   24-hour generation/demand curves, day types, household ticks
    carbon.ts             #   Carbon avoidance calculations
    gridDependence.ts     #   Grid dependence and autonomy metrics
    fairness.ts           #   Fairness scoring across households
    proofInspector.ts     #   Live block-level hash recomputation
    format.ts             #   Formatting utilities
    chainStatus.ts        #   Chain status helpers
    chainExport.ts        #   Chain-to-CSV rendering
    chainPdf.ts           #   Chain-to-PDF report rendering (jsPDF + autoTable)
    dossier.ts            #   Household dossier data
    householdStatus.ts    #   Household status helpers
    permissions.ts        #   Membership-role predicates mirroring the API's rules
    slug.ts               #   Organisation slug derivation and validation
    easing.ts             #   Shared easing functions for animation
  store/
    useEnergyStore.ts     # Zustand shared state (simulation, chain, households)
    useSessionStore.ts    # Zustand authenticated-session state (restore, sign-out, expiry)
    useOrganisationStore.ts # Zustand organisation list and current selection
    useMembershipStore.ts # Zustand member list for the selected organisation
    useInvitationStore.ts # Zustand invitations for the selected organisation
    useSimulationStore.ts # Zustand simulation runs, quota, and results
    useLedgerStore.ts     # Zustand settlement ledger and integrity verdict
    useAuditStore.ts      # Zustand cursor-paginated audit history
    types.ts              # Shared state/types for the three store slices
    simSlice.ts           # Simulation slice (config, households, ticking, trading)
    ledgerSlice.ts        # Ledger slice (hash chain, tamper, restore)
    uiSlice.ts            # UI slice (dossier selection, block editing)
  components/
    account/              # Account/session components with co-located CSS
    sections/             # Page-section components with co-located CSS
    ui/                   # Reusable UI primitives (ErrorBoundary, SectionHeading, ...)
  pages/
    VoltPage.tsx          # Landing page route composition
    LedgerPage.tsx        # Live ledger route composition
    AccountPage.tsx       # Sign in / create account / sign out
    InvitationAcceptPage.tsx # Accepts an invitation from its emailed link
  theme/
    tokens.ts             # Design tokens (colours, fonts, spacing, easing)
    theme.css             # Global stylesheet
  hooks/                  # Custom React hooks
  utils/                  # Framework-free helpers (animateProgress, scrollToId, downloadFile, ...)
```

## Configuration

Simulation parameters are configurable in `src/store/simSlice.ts` (exposed through `useEnergyStore`):

| Parameter | Description |
|---|---|
| `simSpeed` | Speed multiplier for the simulated clock |
| `startHour` | Hour of day the simulation opens on (0–23) |
| `activity` | Network animation density on the landing page hero |

Day types can be switched at runtime: **Sunny Weekday**, **Cloudy**, **Weekend**, and **Heatwave**. Each alters solar generation curves and demand profiles independently.

`dayType` and `startHour` can also be set for a single page load without touching code — see **Shareable scenarios** under Live Ledger features, above.

All simulation randomness is deterministic — the simulation math never uses `Math.random()`. Every stochastic simulation value is derived from `seededUnit`, a pure function of its integer keys, which guarantees byte-identical replay for the same inputs. (The decorative canvas animations on the landing page and ledger map do use `Math.random()` for visual jitter only; they never affect simulation state.)

## Architecture Notes

- **Pure logic layer** (`src/lib/`) contains no React, no DOM access, and no store imports. All simulation math and hash chain logic is framework-agnostic and testable in isolation.
- **Deterministic simulation** — Every function in the simulation layer is a pure function of `(dayType, hour, householdId)`. No accumulated state across ticks. Querying the same hour twice returns byte-identical values, enabling future replay/scrub features.
- **Tamper-evident, not tamper-proof** — Nothing prevents editing a block. The hash chain makes edits detectable on re-validation. Because the chain is client-side with no distribution or consensus, it functions as an append-only log with a cryptographic integrity guarantee, not a distributed ledger.
- **Accessibility** — All motion respects `prefers-reduced-motion`. Animations stand down when the operating system requests it.
- **Responsive** — Layout adapts to mobile viewports without breaking existing functionality.

## License

[MIT](LICENSE) — built for the Open Energy Challenge 2026.
