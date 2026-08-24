import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const blueprint = readFileSync(fileURLToPath(new URL('../../../render.yaml', import.meta.url)), 'utf8')

function buildCommands(): string[] {
  return blueprint
    .split('\n')
    .filter((line) => line.includes('buildCommand:'))
    .map((line) => line.trim())
}

function serviceBlock(header: string): string {
  const start = blueprint.indexOf(header)
  expect(start).toBeGreaterThan(-1)
  const next = blueprint.indexOf('\n  - type:', start + 1)
  return blueprint.slice(start, next === -1 ? blueprint.length : next)
}

describe('Render Blueprint build commands', () => {
  it('installs dev dependencies before every source build', () => {
    // TypeScript and Vite are devDependencies, so a default `npm ci` on a
    // production install leaves nothing that can perform a build.
    const commands = buildCommands()

    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) {
      expect(command).toContain('npm ci --include=dev')
    }
  })

  it('builds both halves in the service that serves both', () => {
    // One service answers for the site and the API, so one build command has to
    // produce dist/ as well as server/dist/ — a missing browser bundle stops the
    // process at startup rather than serving a blank page.
    const web = serviceBlock('  - type: web')

    expect(web).toMatch(/buildCommand:.*npm run build\b/)
    expect(web).toMatch(/buildCommand:.*npm run build:api/)
  })

  it('tells the web service to serve the site, and where to reach the API', () => {
    const web = serviceBlock('  - type: web')

    expect(web).toContain('key: SERVE_WEB')
    // Vite inlines this at build time; "/" keeps the bundle free of any origin.
    expect(web).toMatch(/key: VITE_API_BASE_URL\s*\n\s*value: "\/"/)
  })

  it('passes email delivery settings to the worker that drains the outbox', () => {
    const worker = serviceBlock('  - type: worker')

    expect(worker).toContain('key: RESEND_API_KEY')
    expect(worker).toContain('key: EMAIL_FROM')
  })

  it('gives the worker the origins it cannot read off the platform', () => {
    // RENDER_EXTERNAL_URL only exists for services that are reachable, so a
    // background worker has to be told both URLs outright.
    const worker = serviceBlock('  - type: worker')

    expect(worker).toContain('key: WEB_ORIGIN')
    expect(worker).toContain('key: BETTER_AUTH_URL')
  })
})
