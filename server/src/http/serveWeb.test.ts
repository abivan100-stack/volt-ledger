import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import { buildApp } from '../app.js'

/**
 * One service serving both the site and the API.
 *
 * The arrangement only pays off if the two never get in each other's way: the
 * API must keep answering as JSON on its own paths, and the app must be able to
 * own every other URL, including ones no server route was ever written for.
 */

const THEME_SCRIPT = "\n      document.documentElement.dataset.theme = 'dark'\n    "
const INDEX_HTML = `<!doctype html><html><head><script>${THEME_SCRIPT}</script>` +
  '<script type="module" src="/assets/index-abc.js"></script></head><body></body></html>'

const anonymous: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
  getSession: async () => null,
}

let root = ''
const apps: FastifyInstance[] = []

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'volt-serve-web-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), INDEX_HTML, 'utf8')
  await writeFile(join(root, 'assets', 'index-abc.js'), 'export const volt = 1\n', 'utf8')
  await writeFile(join(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function siteApp(): Promise<FastifyInstance> {
  const app = await buildApp({
    logger: false,
    auth: anonymous,
    databasePing: async () => undefined,
    serveWeb: true,
    webDistDir: root,
  })
  apps.push(app)
  await app.ready()
  return app
}

describe('serving the site from the API process', () => {
  it('answers the root with the page', async () => {
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('<!doctype html>')
  })

  it('answers a client-routed page with the same shell', async () => {
    // No server route exists for /ledger and none should: the app routes it.
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/ledger' })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('<!doctype html>')
  })

  it('serves the built assets', async () => {
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/assets/index-abc.js' })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('export const volt')
  })

  it('lets the browser keep fingerprinted assets forever and the shell never', async () => {
    const app = await siteApp()

    const asset = await app.inject({ method: 'GET', url: '/assets/index-abc.js' })
    const shell = await app.inject({ method: 'GET', url: '/' })

    expect(asset.headers['cache-control']).toContain('immutable')
    // A cached shell names asset hashes that the next deploy deletes.
    expect(shell.headers['cache-control']).toBe('no-cache')
  })
})

describe('keeping the API answerable', () => {
  it('still serves the API on its own paths', async () => {
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok' })
  })

  it('answers an unknown API path as JSON, not as a page', async () => {
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/nothing-here' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Not found', code: 'NOT_FOUND' })
  })

  it('does not turn a missing asset into a page', async () => {
    // 200 text/html for a .js request reads as "unexpected token <" in the
    // browser, which points nowhere near the actual problem.
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/assets/deleted-by-the-last-deploy.js' })

    expect(response.statusCode).toBe(404)
  })

  it('does not answer a POST to an unknown path with the page', async () => {
    const app = await siteApp()

    const response = await app.inject({ method: 'POST', url: '/not-a-route' })

    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('application/json')
  })
})

describe('the policy the page is served under', () => {
  it('authorises the inline script by hash rather than by allowing inline', async () => {
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/' })
    const policy = String(response.headers['content-security-policy'])
    const digest = createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64')

    expect(policy).toContain(`'sha256-${digest}'`)
    // The theme script runs; anything an injection writes later still does not.
    expect(policy).not.toContain("'unsafe-inline'; script-src")
    expect(policy).toMatch(/script-src [^;]*'self'/)
  })

  it('leaves the rest of the default policy alone', async () => {
    const app = await siteApp()

    const response = await app.inject({ method: 'GET', url: '/' })
    const policy = String(response.headers['content-security-policy'])

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("object-src 'none'")
  })
})

describe('when the site is not being served', () => {
  it('leaves the API exactly as it was', async () => {
    const app = await buildApp({
      logger: false,
      auth: anonymous,
      databasePing: async () => undefined,
      serveWeb: false,
    })
    apps.push(app)
    await app.ready()

    const page = await app.inject({ method: 'GET', url: '/ledger' })
    const health = await app.inject({ method: 'GET', url: '/health' })

    expect(page.statusCode).toBe(404)
    expect(page.headers['content-type']).toContain('application/json')
    expect(health.statusCode).toBe(200)
  })
})
