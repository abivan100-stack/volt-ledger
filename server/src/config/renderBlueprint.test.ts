import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const blueprint = readFileSync(fileURLToPath(new URL('../../../render.yaml', import.meta.url)), 'utf8')

describe('Render Blueprint build commands', () => {
  it('installs dev dependencies before every source build', () => {
    const buildCommands = blueprint
      .split('\n')
      .filter((line) => line.includes('buildCommand:'))
      .map((line) => line.trim())

    expect(buildCommands).toEqual([
      'buildCommand: npm ci --include=dev && npm run build:api',
      'buildCommand: npm ci --include=dev && npm run build:api',
      'buildCommand: npm ci --include=dev && npm run build',
    ])
  })

  it('passes email delivery settings to the worker that drains the outbox', () => {
    const workerStart = blueprint.indexOf('  - type: worker')
    const staticStart = blueprint.indexOf('  - type: web', workerStart + 1)
    const worker = blueprint.slice(workerStart, staticStart)

    expect(worker).toContain('key: RESEND_API_KEY')
    expect(worker).toContain('key: EMAIL_FROM')
  })
})
