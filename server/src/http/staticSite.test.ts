import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inlineScriptHashes, isApiPath, loadStaticSite, servesAppShell } from './staticSite.js'

describe('which paths belong to the API', () => {
  it('claims the API surface', () => {
    expect(isApiPath('/api/v1/me')).toBe(true)
    expect(isApiPath('/api/auth/sign-in/email-otp')).toBe(true)
    expect(isApiPath('/health')).toBe(true)
    expect(isApiPath('/openapi.json')).toBe(true)
  })

  it('ignores the query string', () => {
    expect(isApiPath('/api/v1/demo/sessions/abc/ledger?timeframe=all')).toBe(true)
    expect(isApiPath('/ledger?timeframe=all')).toBe(false)
  })

  it('leaves page names that merely start alike to the app', () => {
    // `/healthcheck` is a page somebody may well add. Matching it as API would
    // be a bug that only surfaced on the day they did.
    expect(isApiPath('/healthcheck')).toBe(false)
    expect(isApiPath('/apidocs')).toBe(false)
  })
})

describe('what gets the app shell', () => {
  it('serves a client-routed page', () => {
    expect(servesAppShell('GET', '/ledger')).toBe(true)
    expect(servesAppShell('GET', '/organisations/abc/settlement')).toBe(true)
    expect(servesAppShell('HEAD', '/ledger')).toBe(true)
  })

  it('never answers an API path with HTML', () => {
    // A fetch caller handed a page of HTML reports a JSON parse error, which
    // sends whoever reads it looking in entirely the wrong place.
    expect(servesAppShell('GET', '/api/v1/nope')).toBe(false)
    expect(servesAppShell('GET', '/health')).toBe(false)
  })

  it('refuses anything but a page request', () => {
    expect(servesAppShell('POST', '/ledger')).toBe(false)
    expect(servesAppShell('DELETE', '/ledger')).toBe(false)
  })

  it('lets a missing asset stay missing', () => {
    // Answering a stale script URL with 200 text/html turns "this deploy is
    // broken" into "unexpected token <", one of the least helpful errors going.
    expect(servesAppShell('GET', '/assets/index-abc123.js')).toBe(false)
    expect(servesAppShell('GET', '/favicon.svg')).toBe(false)
  })
})

describe('authorising the scripts inside the page', () => {
  it('hashes an inline script exactly as a browser would', () => {
    const body = "\n      document.documentElement.dataset.theme = 'light'\n    "
    const html = `<html><head><script>${body}</script></head></html>`
    const expected = createHash('sha256').update(body, 'utf8').digest('base64')

    expect(inlineScriptHashes(html)).toEqual([`'sha256-${expected}'`])
  })

  it('ignores scripts that are loaded rather than written in', () => {
    const html = '<script type="module" crossorigin src="/assets/index-abc.js"></script>'

    expect(inlineScriptHashes(html)).toEqual([])
  })

  it('ignores an empty script block', () => {
    expect(inlineScriptHashes('<script>\n  \n</script>')).toEqual([])
  })

  it('covers every inline script, not just the first', () => {
    const html = '<script>one()</script><script>two()</script>'

    expect(inlineScriptHashes(html)).toHaveLength(2)
  })

  it('tracks the file rather than a pinned constant', () => {
    // The hash is computed from the document being served, so editing the
    // inline script cannot leave the policy behind refusing to run it.
    const before = inlineScriptHashes('<script>one()</script>')
    const after = inlineScriptHashes('<script>one(); two()</script>')

    expect(before).not.toEqual(after)
  })
})

describe('loading a built site', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'volt-site-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reports the hashes of the scripts in the real index.html', async () => {
    await writeFile(join(root, 'index.html'), '<html><script>theme()</script></html>', 'utf8')

    const site = await loadStaticSite(root)

    expect(site.scriptHashes).toHaveLength(1)
    expect(site.root).toBe(root)
  })

  it('refuses to start when the bundle was never built', async () => {
    // Discovering this from a 500 on the first visit, after the health check has
    // already called the process healthy, is strictly worse than not starting.
    await mkdir(join(root, 'assets'), { recursive: true })

    await expect(loadStaticSite(root)).rejects.toThrow(/npm run build/)
  })

  it('names the directory it looked in when it fails', async () => {
    await expect(loadStaticSite(join(root, 'absent'))).rejects.toThrow(/absent/)
  })
})
