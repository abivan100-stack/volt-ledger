import { createSilentLogger, type Logger } from '../observability/logger.js'
import { computeBackoffMs } from '../simulations/backoff.js'
import {
  EmailDeliveryError,
  sendVerificationCodeEmail,
  type VerificationCodeEmailInput,
} from './resend.js'

/**
 * Retries a verification code send within the request that triggered it.
 *
 * Better Auth calls this on sign-up, on a sign-in by an unverified account, and
 * when a new address is proposed during an email change, then awaits it through
 * `runInBackgroundOrAwait` — which, with no `backgroundTasks.handler`
 * configured, awaits the promise inline but logs and swallows a rejection
 * rather than letting it fail the request. A transient failure there is
 * invisible: the caller is told the request succeeded, no code arrives, and
 * nothing ever tries again.
 *
 * The invitation outbox already solves durable delivery, but its day-scale
 * backoff is built for a link that lives seven days. A verification code lives
 * ten minutes; a retry that fired after the code's own TTL would deliver
 * something already dead. So this retries fast and few — a handful of attempts
 * within a couple of seconds, worse than the round trip the caller is already
 * waiting on — rather than borrowing the outbox's schedule.
 *
 * Only what `resend.ts` already classified as retryable is retried: a bad SMTP
 * connection, a 5xx, a 429, or a request that never got a response. A rejected
 * address or a misconfigured sender will not fix itself, so those fail on the
 * first attempt.
 */

/** Attempts including the first, so `1` is "no retry". */
export const VERIFICATION_EMAIL_ATTEMPTS = 3
export const VERIFICATION_EMAIL_BASE_MS = 300
export const VERIFICATION_EMAIL_MAX_MS = 1500

export interface VerificationDeliveryOptions {
  attempts?: number
  baseMs?: number
  maxMs?: number
  logger?: Logger
  /** A sample in [0, 1) per retry; defaults to `Math.random`. */
  random?: () => number
  sleep?: (ms: number) => Promise<void>
  /** The send to retry. Defaults to the real provider call; overridden in tests. */
  send?: (input: VerificationCodeEmailInput) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(error: unknown): boolean {
  return error instanceof EmailDeliveryError && error.retryable
}

export async function sendVerificationCodeEmailWithRetry(
  input: VerificationCodeEmailInput,
  options: VerificationDeliveryOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? VERIFICATION_EMAIL_ATTEMPTS
  const baseMs = options.baseMs ?? VERIFICATION_EMAIL_BASE_MS
  const maxMs = options.maxMs ?? VERIFICATION_EMAIL_MAX_MS
  const random = options.random ?? Math.random
  const sleep = options.sleep ?? defaultSleep
  const send = options.send ?? sendVerificationCodeEmail
  const logger = options.logger ?? createSilentLogger()

  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await send(input)
      if (attempt > 1) logger.info('verification_email.recovered', { attempt })
      return
    } catch (error) {
      lastError = error
      const retryable = isRetryable(error)
      logger.warn('verification_email.attempt_failed', { attempt, attempts, retryable, error })
      if (!retryable || attempt === attempts) break
      await sleep(computeBackoffMs(attempt, { baseMs, maxMs, randomSample: random() }))
    }
  }

  // Exhausted or not worth retrying. Logged here in Volt's own structured
  // format before the throw, because the only other place this failure is
  // recorded — Better Auth's internal console logger — is not one Volt reads.
  logger.error('verification_email.exhausted', { attempts, error: lastError })
  throw lastError
}
