import { describe, expect, it } from 'vitest'
import { decryptDeliveryUrl, encryptDeliveryUrl } from './outbox.js'

describe('email delivery payload encryption', () => {
  it('round-trips invitation URLs without storing them in plaintext', () => {
    const url = 'https://volt.example/invite/accept?token=secret-token'
    const encrypted = encryptDeliveryUrl(url)

    expect(encrypted).not.toContain(url)
    expect(decryptDeliveryUrl(encrypted)).toBe(url)
  })

  it('rejects tampered payloads', () => {
    const encrypted = encryptDeliveryUrl('https://volt.example/invite/accept?token=secret-token')
    const last = encrypted.at(-1)
    const tampered = `${encrypted.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`

    expect(() => decryptDeliveryUrl(tampered)).toThrow('EMAIL_DELIVERY_PAYLOAD_INVALID')
  })
})
