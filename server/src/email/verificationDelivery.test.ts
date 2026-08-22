import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../observability/logger.js'
import { EmailDeliveryError } from './resend.js'
import { sendVerificationCodeEmailWithRetry } from './verificationDelivery.js'

/**
 * The failure this exists to close is invisible by construction: Better Auth
 * awaits the send but discards a rejection into its own logger, so the caller
 * is told a code was sent whether or not it was. What is verified here is that
 * a transient failure gets a real second chance before it can reach that
 * swallow, that a permanent one does not waste the caller's time waiting on
 * retries that cannot help, and that an exhausted failure still surfaces —
 * both to the caller, as a rejection, and to Volt's own logs.
 */

function capture() {
  const lines: Record<string, unknown>[] = []
  const logger = createLogger({
    service: 'volt-api',
    level: 'debug',
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  })
  return { logger, lines, events: () => lines.map((line) => line.event as string) }
}

const INPUT = { to: 'asha@example.com', code: '482913', expiresInMinutes: 10 }

function retryable(message = 'SMTP email failed: connection reset') {
  return new EmailDeliveryError(message, 'ECONNRESET', true)
}

function permanent(message = 'SMTP rejected recipient') {
  return new EmailDeliveryError(message, 'SMTP_RECIPIENT_REJECTED', false)
}

describe('sendVerificationCodeEmailWithRetry', () => {
  it('does not retry a send that succeeds first try', async () => {
    const send = vi.fn(async () => undefined)

    await sendVerificationCodeEmailWithRetry(INPUT, { send, sleep: async () => undefined })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(INPUT)
  })

  it('recovers from a transient failure within the same call', async () => {
    const send = vi.fn<() => Promise<void>>()
    send.mockRejectedValueOnce(retryable())
    send.mockResolvedValueOnce(undefined)

    await sendVerificationCodeEmailWithRetry(INPUT, {
      send,
      sleep: async () => undefined,
      random: () => 0,
    })

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('gives up immediately on a failure that will not resolve itself', async () => {
    const send = vi.fn(async () => {
      throw permanent()
    })

    await expect(
      sendVerificationCodeEmailWithRetry(INPUT, { send, sleep: async () => undefined }),
    ).rejects.toThrow('SMTP rejected recipient')

    // A rejected address does not become deliverable by asking again, so
    // retrying it would only make the caller wait longer for the same no.
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('gives up immediately on an error resend.ts never classified', async () => {
    const send = vi.fn(async () => {
      throw new Error('unexpected')
    })

    await expect(
      sendVerificationCodeEmailWithRetry(INPUT, { send, sleep: async () => undefined }),
    ).rejects.toThrow('unexpected')

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stops at the configured attempt ceiling and rethrows the last failure', async () => {
    const send = vi.fn(async () => {
      throw retryable('still down')
    })

    await expect(
      sendVerificationCodeEmailWithRetry(INPUT, {
        send,
        attempts: 3,
        sleep: async () => undefined,
        random: () => 0,
      }),
    ).rejects.toThrow('still down')

    expect(send).toHaveBeenCalledTimes(3)
  })

  it('waits between attempts rather than hammering the provider', async () => {
    const send = vi.fn<() => Promise<void>>()
    send.mockRejectedValueOnce(retryable())
    send.mockResolvedValueOnce(undefined)
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)

    await sendVerificationCodeEmailWithRetry(INPUT, { send, sleep, random: () => 0 })

    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThan(0)
  })

  it('keeps the whole retry budget inside the code’s own lifetime', async () => {
    // A ten-minute code needs its retries measured in seconds, not spread
    // across minutes the way the day-scale invitation outbox is — a retry
    // that fired after the TTL would deliver a code already dead.
    const send = vi.fn(async () => {
      throw retryable()
    })
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)

    await sendVerificationCodeEmailWithRetry(INPUT, {
      send,
      sleep,
      random: () => 1,
      attempts: 3,
    }).catch(() => undefined)

    const totalMs = sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0)
    const tenMinutesMs = 10 * 60 * 1000
    expect(totalMs).toBeLessThan(tenMinutesMs / 100)
  })

  it('passes the exact input through to the send unchanged', async () => {
    const send = vi.fn(async () => undefined)

    await sendVerificationCodeEmailWithRetry(
      { to: 'asha@example.com', code: '000111', expiresInMinutes: 10 },
      { send },
    )

    expect(send).toHaveBeenCalledWith({
      to: 'asha@example.com',
      code: '000111',
      expiresInMinutes: 10,
    })
  })

  describe('logging', () => {
    it('logs each failed attempt and the exhaustion, so a lost code is not silent', async () => {
      const logged = capture()
      const send = vi.fn(async () => {
        throw retryable('still down')
      })

      await sendVerificationCodeEmailWithRetry(INPUT, {
        send,
        attempts: 2,
        sleep: async () => undefined,
        random: () => 0,
        logger: logged.logger,
      }).catch(() => undefined)

      expect(logged.events()).toEqual([
        'verification_email.attempt_failed',
        'verification_email.attempt_failed',
        'verification_email.exhausted',
      ])
    })

    it('logs a recovery, not just the failure that preceded it', async () => {
      const logged = capture()
      const send = vi.fn(async () => undefined)
      send.mockRejectedValueOnce(retryable())
      send.mockResolvedValueOnce(undefined)

      await sendVerificationCodeEmailWithRetry(INPUT, {
        send,
        sleep: async () => undefined,
        random: () => 0,
        logger: logged.logger,
      })

      expect(logged.events()).toEqual([
        'verification_email.attempt_failed',
        'verification_email.recovered',
      ])
    })

    it('stays quiet when nothing failed', async () => {
      const logged = capture()
      const send = vi.fn(async () => undefined)

      await sendVerificationCodeEmailWithRetry(INPUT, { send, logger: logged.logger })

      expect(logged.events()).toEqual([])
    })

    it('does not log the code itself', async () => {
      const logged = capture()
      const send = vi.fn(async () => {
        throw retryable()
      })

      await sendVerificationCodeEmailWithRetry(INPUT, {
        send,
        attempts: 1,
        logger: logged.logger,
      }).catch(() => undefined)

      const serialised = JSON.stringify(logged.lines)
      expect(serialised).not.toContain(INPUT.code)
    })
  })
})
