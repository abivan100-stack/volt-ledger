import { describe, expect, it } from 'vitest'
import { resolveApiListenAddress } from './runtime.js'

describe('resolveApiListenAddress', () => {
  it('keeps the configured local host and port outside Render', () => {
    expect(resolveApiListenAddress({ apiHost: '127.0.0.1', apiPort: 4000 })).toEqual({
      host: '127.0.0.1',
      port: 4000,
    })
  })

  it('binds Render services publicly on the injected port', () => {
    expect(resolveApiListenAddress({ apiHost: '127.0.0.1', apiPort: 4000, renderPort: 10000 })).toEqual({
      host: '0.0.0.0',
      port: 10000,
    })
  })
})
