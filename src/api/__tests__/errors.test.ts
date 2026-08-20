import { describe, it, expect } from 'vitest'
import {
  ApiError,
  isForbiddenError,
  isNetworkError,
  isRateLimitedError,
  isUnauthenticatedError,
} from '../errors'

describe('ApiError', () => {
  it('is an Error with the server message, status and code', () => {
    const error = new ApiError({ message: 'Authentication required', status: 401, code: 'UNAUTHENTICATED' })
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.name).toBe('ApiError')
    expect(error.message).toBe('Authentication required')
    expect(error.status).toBe(401)
    expect(error.code).toBe('UNAUTHENTICATED')
  })

  it('defaults issues to an empty list and retryAfterSeconds to null', () => {
    const error = new ApiError({ message: 'Boom', status: 500, code: 'ORGANISATION_CREATE_FAILED' })
    expect(error.issues).toEqual([])
    expect(error.retryAfterSeconds).toBeNull()
  })

  it('carries validation issues', () => {
    const error = new ApiError({
      message: 'Invalid organisation input',
      status: 400,
      code: 'INVALID_REQUEST',
      issues: [{ path: 'slug', message: 'Invalid' }],
    })
    expect(error.issues).toEqual([{ path: 'slug', message: 'Invalid' }])
  })
})

describe('error predicates', () => {
  it('detects unauthenticated errors', () => {
    expect(isUnauthenticatedError(new ApiError({ message: 'x', status: 401, code: 'UNAUTHENTICATED' }))).toBe(true)
    expect(isUnauthenticatedError(new ApiError({ message: 'x', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }))).toBe(false)
    expect(isUnauthenticatedError(new Error('x'))).toBe(false)
  })

  it('detects forbidden errors for both organisation codes', () => {
    expect(isForbiddenError(new ApiError({ message: 'x', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }))).toBe(true)
    expect(isForbiddenError(new ApiError({ message: 'x', status: 403, code: 'ORGANISATION_ROLE_FORBIDDEN' }))).toBe(true)
    expect(isForbiddenError(new ApiError({ message: 'x', status: 401, code: 'UNAUTHENTICATED' }))).toBe(false)
  })

  it('detects rate-limited errors', () => {
    expect(isRateLimitedError(new ApiError({ message: 'x', status: 429, code: 'SIMULATION_QUOTA_EXHAUSTED' }))).toBe(true)
    expect(isRateLimitedError(new ApiError({ message: 'x', status: 500, code: 'X' }))).toBe(false)
  })

  it('detects network errors', () => {
    expect(isNetworkError(new ApiError({ message: 'x', status: 0, code: 'NETWORK_ERROR' }))).toBe(true)
    expect(isNetworkError(new ApiError({ message: 'x', status: 500, code: 'X' }))).toBe(false)
  })
})
