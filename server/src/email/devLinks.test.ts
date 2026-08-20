import { describe, expect, it, vi } from 'vitest'
import { announceLink, formatLinkAnnouncement, shouldAnnounceLinks } from './devLinks.js'

/**
 * The one rule that matters here is the production one.
 *
 * A verification URL carries a signed token that grants the action it names, so
 * it is a credential. Printing it is what makes local development workable and
 * what would make a production log a way in.
 */

const URL = 'http://localhost:4000/api/auth/verify-email?token=signed.token.value'

describe('shouldAnnounceLinks', () => {
  it('announces in development and test', () => {
    expect(shouldAnnounceLinks('development')).toBe(true)
    expect(shouldAnnounceLinks('test')).toBe(true)
  })

  it('never announces in production', () => {
    expect(shouldAnnounceLinks('production')).toBe(false)
  })
})

describe('announceLink', () => {
  it('prints the recipient and the link', () => {
    const sink = vi.fn()

    announceLink('Verify your Volt account', 'asha@example.com', URL, {
      nodeEnv: 'development',
      sink,
    })

    const printed = sink.mock.calls[0]?.[0] as string
    expect(printed).toContain('Verify your Volt account')
    expect(printed).toContain('asha@example.com')
    expect(printed).toContain(URL)
  })

  it('stays silent in production', () => {
    const sink = vi.fn()

    announceLink('Verify your Volt account', 'asha@example.com', URL, {
      nodeEnv: 'production',
      sink,
    })

    expect(sink).not.toHaveBeenCalled()
  })
})

describe('formatLinkAnnouncement', () => {
  it('keeps the URL on its own line so a terminal does not break it', () => {
    const lines = formatLinkAnnouncement('Label', 'asha@example.com', URL).split('\n')
    const urlLine = lines.find((line) => line.includes(URL))

    expect(urlLine?.trim()).toBe(`open: ${URL}`)
  })
})
