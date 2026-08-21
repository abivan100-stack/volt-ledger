import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, type OrganisationRouteRepositories } from '../app.js'
import type { AuthService } from '../auth/auth.js'
import { DOCUMENTED_ROUTES } from './document.js'

/**
 * Keeps the OpenAPI document and the running app in step, in both directions:
 * every documented route must exist, and every `/api/v1` route the app serves
 * must be documented. Without this the document is a wish rather than a
 * contract.
 */

const apps: FastifyInstance[] = []

const anonymous: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
  getSession: async () => null,
}

/**
 * Repositories that throw the moment anything reads them. An anonymous request
 * must be refused before any data access, so touching one of these is itself
 * the failure.
 */
const forbiddenRepositories = new Proxy(
  {},
  {
    get(_target, collection) {
      return new Proxy(
        {},
        {
          get(_inner, method) {
            return () => {
              throw new Error(
                `Repository ${String(collection)}.${String(method)} was reached without a session`,
              )
            }
          },
        },
      )
    },
  },
) as OrganisationRouteRepositories

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function startApp(): Promise<FastifyInstance> {
  const app = await buildApp({
    logger: false,
    auth: anonymous,
    repositories: forbiddenRepositories,
    databasePing: async () => undefined,
  })
  apps.push(app)
  await app.ready()
  return app
}

/**
 * Rebuilds full paths from `printRoutes`, whose tree indents each level by one
 * four-character group.
 */
export function parseRouteTree(tree: string): Array<{ method: string; path: string }> {
  const segments: string[] = []
  const routes: Array<{ method: string; path: string }> = []

  for (const line of tree.split('\n')) {
    const match = /^([│\s]*)(?:[├└]──\s)?(\S+)\s\(([^)]+)\)\s*$/.exec(line)
    if (!match) continue

    const [, indent = '', segment = '', methods = ''] = match
    const depth = Math.floor(indent.length / 4)
    segments.length = depth
    segments[depth] = segment

    const path = segments.slice(0, depth + 1).join('')
    for (const method of methods.split(',').map((entry) => entry.trim().toLowerCase())) {
      // HEAD is derived from GET by Fastify and OPTIONS comes from CORS; neither
      // is a route anybody hand-wrote.
      if (method === 'head' || method === 'options') continue
      routes.push({ method, path })
    }
  }

  return routes
}

/**
 * A body each write route would accept, so that validation passes and
 * authentication is what rejects the request. Several handlers parse input
 * before checking the session, which is fine — a malformed request reveals
 * nothing — but it would otherwise mask the 401 this test is looking for.
 */
const VALID_BODIES: Record<string, object> = {
  'post /api/v1/organisations': { name: 'Nolambur Microgrid', slug: 'nolambur-microgrid' },
  'post /api/v1/organisations/:organisationId/simulations': {
    seed: 'seed-1',
    simulationDate: '2026-08-01',
    dayType: 'sunny-weekday',
    households: [{ id: 'h1', pvKw: 3, baseLoadKw: 1 }],
  },
  'post /api/v1/organisations/:organisationId/simulations/:runId/settlement': { outcome: 'p50' },
  'post /api/v1/organisations/:organisationId/ledger/adjustments': {
    targetEventId: 'event-1',
    idempotencyKey: 'key-1',
    energyKwh: -0.5,
    estimatedCreditInr: -2.75,
    reason: 'Meter correction',
  },
  'post /api/v1/organisations/:organisationId/ownership/transfer': { newOwnerUserId: 'user-2' },
  'patch /api/v1/organisations/:organisationId/memberships/:userId': { role: 'operator' },
  'post /api/v1/organisations/:organisationId/invitations': {
    email: 'asha@example.com',
    role: 'operator',
  },
  'post /api/v1/invitations/accept': { token: 'token-abc' },
}

/** Concrete values so a documented path can actually be requested. */
function concretePath(path: string): string {
  return path
    .replace(':organisationId', '11111111-1111-4111-8111-111111111111')
    .replace(':userId', 'user-1')
    .replace(':invitationId', 'invitation-1')
    .replace(':runId', 'run-1')
}

describe('parseRouteTree', () => {
  it('rebuilds nested paths and drops derived methods', () => {
    const tree = [
      '├── /health (GET, HEAD)',
      '├── * (OPTIONS)',
      '├── /api/v1/organisations (POST, GET, HEAD)',
      '│   └── /:organisationId (GET, HEAD, DELETE)',
      '│       ├── /simulations (POST)',
      '│       │   └── /:runId (GET, HEAD)',
      '│       │       └── /settlement (POST)',
      '└── /api/v1/invitations/accept (POST)',
    ].join('\n')

    expect(parseRouteTree(tree)).toEqual([
      { method: 'get', path: '/health' },
      { method: 'post', path: '/api/v1/organisations' },
      { method: 'get', path: '/api/v1/organisations' },
      { method: 'get', path: '/api/v1/organisations/:organisationId' },
      { method: 'delete', path: '/api/v1/organisations/:organisationId' },
      { method: 'post', path: '/api/v1/organisations/:organisationId/simulations' },
      { method: 'get', path: '/api/v1/organisations/:organisationId/simulations/:runId' },
      { method: 'post', path: '/api/v1/organisations/:organisationId/simulations/:runId/settlement' },
      { method: 'post', path: '/api/v1/invitations/accept' },
    ])
  })
})

describe('document coverage', () => {
  it('documents every /api/v1 route the app serves', async () => {
    const app = await startApp()
    const served = parseRouteTree(app.printRoutes({ commonPrefix: false })).filter((route) =>
      route.path.startsWith('/api/v1'),
    )

    // Sanity check that the parse actually found the app's routes.
    expect(served.length).toBeGreaterThan(15)

    const documented = new Set(
      DOCUMENTED_ROUTES.map((route) => `${route.method} ${route.path}`),
    )
    const undocumented = served
      .map((route) => `${route.method} ${route.path}`)
      .filter((key) => !documented.has(key))

    expect(undocumented).toEqual([])
  })

  it('documents no route the app does not serve', async () => {
    const app = await startApp()
    const served = new Set(
      parseRouteTree(app.printRoutes({ commonPrefix: false })).map(
        (route) => `${route.method} ${route.path}`,
      ),
    )

    const missing = DOCUMENTED_ROUTES.map((route) => `${route.method} ${route.path}`).filter(
      (key) => !served.has(key),
    )

    expect(missing).toEqual([])
  })

  it('reaches every documented route with a real request', async () => {
    const app = await startApp()

    for (const route of DOCUMENTED_ROUTES) {
      const response = await app.inject({
        method: route.method.toUpperCase() as 'GET',
        url: concretePath(route.path),
        payload: VALID_BODIES[`${route.method} ${route.path}`],
      })

      // Anything but Fastify's own "route not found" proves the route is wired.
      expect(response.statusCode, `${route.method} ${route.path}`).not.toBe(404)
    }
  })

  it('answers 401 rather than 404 on every authenticated documented route', async () => {
    const app = await startApp()

    for (const route of DOCUMENTED_ROUTES) {
      if (!route.path.startsWith('/api/v1')) continue
      const response = await app.inject({
        method: route.method.toUpperCase() as 'GET',
        url: concretePath(route.path),
        payload: VALID_BODIES[`${route.method} ${route.path}`],
      })

      // Every /api/v1 route is behind the session cookie, so an anonymous
      // request must be rejected for that reason and no other — and, because the
      // repositories above throw on contact, without reading any data first.
      expect(response.statusCode, `${route.method} ${route.path}`).toBe(401)
      expect(response.json(), `${route.method} ${route.path}`).toEqual({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      })
    }
  })
})
