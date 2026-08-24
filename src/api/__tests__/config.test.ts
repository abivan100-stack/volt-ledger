import { afterEach, describe, it, expect, vi } from 'vitest'
import { isApiConfigured, requireApiBaseUrl, resolveApiBaseUrl } from '../config'
import { ApiError } from '../errors'

describe('resolveApiBaseUrl', () => {
  it('returns null when the variable is undefined', () => {
    expect(resolveApiBaseUrl(undefined)).toBeNull()
  })

  it('returns null when the variable is blank', () => {
    expect(resolveApiBaseUrl('   ')).toBeNull()
  })

  it('normalises a bare origin', () => {
    expect(resolveApiBaseUrl('http://localhost:4000')).toBe('http://localhost:4000')
  })

  it('strips a trailing slash', () => {
    expect(resolveApiBaseUrl('http://localhost:4000/')).toBe('http://localhost:4000')
  })

  it('preserves a path prefix without its trailing slash', () => {
    expect(resolveApiBaseUrl('https://api.example.com/volt/')).toBe('https://api.example.com/volt')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveApiBaseUrl('  https://api.example.com  ')).toBe('https://api.example.com')
  })

  it('throws on a malformed URL so misconfiguration is loud', () => {
    expect(() => resolveApiBaseUrl('not-a-url')).toThrow(/VITE_API_BASE_URL/)
  })

  it('rejects a non-http protocol', () => {
    expect(() => resolveApiBaseUrl('ftp://api.example.com')).toThrow(/VITE_API_BASE_URL/)
  })
})

/**
 * One deployment serving both the site and the API.
 *
 * Vite inlines this variable at build time, so naming an origin there is a
 * promise about a URL that a rename or a custom domain can quietly break. The
 * literal "/" makes no such promise: requests go wherever the page came from.
 */
describe('a same-origin build', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves to an empty prefix, which leaves request paths relative', () => {
    expect(resolveApiBaseUrl('/')).toBe('')
  })

  it('is not mistaken for an unconfigured build', () => {
    // The difference matters: unconfigured means the demo runs in memory and
    // the account UI is hidden, which is not what a same-origin deploy wants.
    vi.stubEnv('VITE_API_BASE_URL', '/')

    expect(isApiConfigured()).toBe(true)
    expect(requireApiBaseUrl()).toBe('')
  })

  it('is still distinct from unset', () => {
    expect(resolveApiBaseUrl('')).toBeNull()
    expect(resolveApiBaseUrl('/')).not.toBeNull()
  })

  it('tolerates surrounding whitespace', () => {
    expect(resolveApiBaseUrl('  /  ')).toBe('')
  })

  it('does not treat a deeper path as same-origin', () => {
    // "/volt" is not an origin and cannot be resolved as one; saying so beats
    // silently building requests against a prefix nobody meant.
    expect(() => resolveApiBaseUrl('/volt')).toThrow(/VITE_API_BASE_URL/)
  })
})

describe('environment-backed base URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports the API as unconfigured when VITE_API_BASE_URL is absent', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    const { isApiConfigured } = await import('../config')
    expect(isApiConfigured()).toBe(false)
  })

  it('reports the API as configured once VITE_API_BASE_URL is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000')
    const { isApiConfigured, apiBaseUrl } = await import('../config')
    expect(isApiConfigured()).toBe(true)
    expect(apiBaseUrl()).toBe('http://localhost:4000')
  })

  it('requireApiBaseUrl throws API_NOT_CONFIGURED when unset', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    const { requireApiBaseUrl } = await import('../config')
    const error = (() => {
      try {
        requireApiBaseUrl()
        return null
      } catch (caught) {
        return caught as ApiError
      }
    })()
    expect(error).toBeInstanceOf(ApiError)
    expect(error?.code).toBe('API_NOT_CONFIGURED')
  })

  it('requireApiBaseUrl returns the normalised base URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/')
    const { requireApiBaseUrl } = await import('../config')
    expect(requireApiBaseUrl()).toBe('http://localhost:4000')
  })
})
