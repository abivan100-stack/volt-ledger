import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

/**
 * Serving the browser bundle from the API process.
 *
 * Volt normally ships as two things: a static site and a JSON API on separate
 * origins. A single-service deployment collapses them onto one origin, which is
 * not merely cheaper — it removes cross-origin cookies and the CORS pin from the
 * picture entirely, so a session works without either side knowing the other's
 * address.
 *
 * This is opt-in through `SERVE_WEB`. With it off nothing here is registered and
 * the API behaves exactly as it always has, which is what keeps the two-origin
 * deployment and the whole test suite unaffected.
 */

/**
 * Where `npm run build` leaves the browser bundle.
 *
 * Resolved from this module rather than the working directory, so it is right
 * whether the process was started from the repository root or anywhere else,
 * and whether it is running the TypeScript source under tsx (`server/src/http/`)
 * or the compiled output (`server/dist/http/`) — both sit three levels below the
 * repository root.
 */
export const WEB_DIST_DIR = fileURLToPath(new URL('../../../dist/', import.meta.url))

/** Strips the query string; routing decisions are about the path alone. */
function pathnameOf(url: string): string {
  const queryStart = url.indexOf('?')
  return queryStart === -1 ? url : url.slice(0, queryStart)
}

/**
 * Whether a path belongs to the API rather than the single-page app.
 *
 * `/health` and `/openapi.json` are matched exactly: `/healthcheck` is a page
 * name the app is entitled to route, and swallowing it here would be a bug that
 * only appeared once somebody added that page.
 */
export function isApiPath(url: string): boolean {
  const path = pathnameOf(url)
  return path === '/health' || path === '/openapi.json' || path === '/api' || path.startsWith('/api/')
}

/**
 * Whether an unmatched request should be answered with the app shell.
 *
 * A single-page app owns its own routing, so `/ledger` has to return the same
 * HTML as `/` and let the client render it. Two things must not be swallowed by
 * that rule:
 *
 * - anything the API owns, which must keep returning its own 404 rather than a
 *   page of HTML a fetch caller cannot parse;
 * - anything that looks like a file. A request for a hashed asset that is not
 *   there is a broken deployment, and answering it with `200 text/html` turns a
 *   clear 404 into a script tag that fails to parse.
 */
export function servesAppShell(method: string, url: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false

  const path = pathnameOf(url)
  if (isApiPath(path)) return false

  const lastSegment = path.slice(path.lastIndexOf('/') + 1)
  return !lastSegment.includes('.')
}

const INLINE_SCRIPT = /<script(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi

/**
 * Content-Security-Policy hashes for the scripts written into the HTML itself.
 *
 * `index.html` carries one inline script deliberately: it applies the stored
 * theme before first paint, so a dark-mode reader never gets a white flash while
 * the bundle loads. Being inline is the entire point of it, and a strict
 * `script-src 'self'` would refuse to run it.
 *
 * Rather than weaken the policy with `'unsafe-inline'` or pin a hash constant
 * that silently rots the next time the script changes, the hashes are computed
 * from the very file about to be served. The policy therefore authorises exactly
 * the scripts that are actually in the document and nothing else — including
 * nothing an injection adds later, which is what the directive is for.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []

  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1] ?? ''
    // Whitespace-only blocks execute nothing; hashing them would authorise the
    // empty string for no reason.
    if (body.trim() === '') continue
    // The digest covers the element's text verbatim, leading and trailing
    // whitespace included, which is what a browser hashes when it checks.
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  }

  return hashes
}

export interface StaticSite {
  /** Absolute path of the directory being served. */
  root: string
  /** `script-src` entries the served HTML needs, in CSP source-expression form. */
  scriptHashes: string[]
  /** Registers static file serving and the single-page-app fallback. */
  register: (app: FastifyInstance) => Promise<void>
}

/**
 * Reads the built site and prepares it for serving.
 *
 * Fails at startup rather than per request. A service told to serve a site it
 * does not have is misconfigured, and finding that out from a 500 on the first
 * visit — after the health check has already reported the process healthy — is
 * strictly worse than not starting.
 */
export async function loadStaticSite(root: string = WEB_DIST_DIR): Promise<StaticSite> {
  const indexPath = join(root, 'index.html')

  let html: string
  try {
    html = await readFile(indexPath, 'utf8')
  } catch {
    throw new Error(
      [
        'SERVE_WEB is on, but the built browser bundle was not found.',
        `  Looked for: ${indexPath}`,
        '  Run "npm run build" before starting the API, or set SERVE_WEB=false to run the API alone.',
      ].join('\n'),
    )
  }

  const scriptHashes = inlineScriptHashes(html)

  return {
    root,
    scriptHashes,
    register: async (app: FastifyInstance): Promise<void> => {
      await app.register(fastifyStatic, {
        root,
        // Leaves unmatched paths to the not-found handler below, which is what
        // decides between the app shell and a 404.
        wildcard: false,
        index: ['index.html'],
        setHeaders: (reply, filePath: string) => {
          if (filePath.includes(`${sep}assets${sep}`)) {
            // Vite fingerprints these filenames, so the content at a given URL
            // never changes and the browser need never ask again.
            reply.header('cache-control', 'public, max-age=31536000, immutable')
          } else {
            // The shell names the current asset hashes. Caching it is how a
            // browser ends up asking for scripts that a deploy has deleted.
            reply.header('cache-control', 'no-cache')
          }
        },
      })

      app.setNotFoundHandler((request, reply) => {
        if (servesAppShell(request.method, request.url)) {
          return reply.type('text/html').sendFile('index.html')
        }
        return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' })
      })
    },
  }
}
