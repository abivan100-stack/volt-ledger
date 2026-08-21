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
})
