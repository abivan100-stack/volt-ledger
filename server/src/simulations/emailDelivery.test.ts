import { describe, expect, it, vi } from 'vitest'
import type { EmailDeliveryDocument } from '../db/models.js'
import { encryptDeliveryUrl } from '../email/outbox.js'
import { processNextEmailDelivery } from './worker.js'

function delivery(overrides: Partial<EmailDeliveryDocument> = {}): EmailDeliveryDocument {
  const now = new Date('2030-01-01T00:00:00.000Z')
  return {
    _id: 'delivery_1',
    idempotencyKey: 'organisation-invitation:invitation_1',
    kind: 'organisation_invitation',
    to: 'friend@example.com',
    organisationName: 'Solar Commons',
    role: 'operator',
    encryptedUrl: encryptDeliveryUrl('http://localhost:5173/invite/accept?token=secret'),
    status: 'processing',
    attemptCount: 1,
    nextAttemptAt: now,
    lockedUntil: new Date('2030-01-01T00:05:00.000Z'),
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...overrides,
  }
}

function repository(document: EmailDeliveryDocument) {
  const markSent = vi.fn(async () => true)
  const markFailed = vi.fn(async () => true)
  return {
    emailDeliveries: {
      claimNext: vi.fn(async () => document),
      markSent,
      markFailed,
    },
    markSent,
    markFailed,
  }
}

describe('email delivery worker', () => {
  it('sends a claimed delivery and marks it sent with its idempotency key', async () => {
    const repo = repository(delivery())
    const sender = vi.fn(async () => undefined)

    const result = await processNextEmailDelivery(repo, undefined, {
      sender,
      random: () => 0,
    })

    expect(result?.status).toBe('sent')
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({
      to: 'friend@example.com',
      idempotencyKey: 'organisation-invitation:invitation_1',
      url: expect.stringContaining('/invite/accept'),
    }))
    expect(repo.markSent).toHaveBeenCalledOnce()
    expect(repo.markFailed).not.toHaveBeenCalled()
  })

  it('requeues transient sender errors with bounded backoff', async () => {
    const repo = repository(delivery())
    const sender = vi.fn(async () => { throw new Error('provider unavailable') })

    const result = await processNextEmailDelivery(repo, undefined, {
      sender,
      retryBaseMs: 1_000,
      retryMaxMs: 10_000,
      random: () => 0,
    })

    expect(result?.status).toBe('pending')
    expect(repo.markFailed).toHaveBeenCalledWith(
      'delivery_1',
      expect.any(Date),
      'EMAIL_DELIVERY_RETRYABLE_FAILURE',
      false,
    )
  })

  it('quarantines invalid encrypted payloads without retrying forever', async () => {
    const repo = repository(delivery({ encryptedUrl: 'tampered' }))
    const sender = vi.fn(async () => undefined)

    const result = await processNextEmailDelivery(repo, undefined, { sender })

    expect(result?.status).toBe('failed')
    expect(repo.markFailed).toHaveBeenCalledWith(
      'delivery_1',
      expect.any(Date),
      'EMAIL_DELIVERY_PAYLOAD_INVALID',
      true,
    )
    expect(sender).not.toHaveBeenCalled()
  })
})
