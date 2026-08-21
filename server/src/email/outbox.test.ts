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
    const [iv, tag, ciphertext] = encrypted.split('.')
    const first = ciphertext?.[0]
    const tampered = `${iv}.${tag}.${first === 'A' ? 'B' : 'A'}${ciphertext?.slice(1) ?? ''}`

    expect(() => decryptDeliveryUrl(tampered)).toThrow('EMAIL_DELIVERY_PAYLOAD_INVALID')
  })
})
