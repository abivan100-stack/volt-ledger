import { describe, it, expect } from 'vitest'
import {
  ApiError,
  getApiErrorMessage,
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

describe('getApiErrorMessage', () => {
  it('prefers the server message and otherwise returns the supplied fallback', () => {
    expect(getApiErrorMessage(new ApiError({ message: 'Invalid input', status: 400, code: 'INVALID_REQUEST' }), 'Try again')).toBe('Invalid input')
    expect(getApiErrorMessage(new Error('transport failure'), 'Try again')).toBe('Try again')
  })
})
