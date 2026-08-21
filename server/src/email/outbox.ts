import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

const algorithm = 'aes-256-gcm'
const ivLength = 12

function encryptionKey(): Buffer {
  return createHash('sha256').update(env.BETTER_AUTH_SECRET).digest()
}

/** Encrypts invitation links before they are persisted in the delivery outbox. */
export function encryptDeliveryUrl(url: string): string {
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv(algorithm, encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.')
}

/** Decrypts an outbox link immediately before handing it to the email provider. */
export function decryptDeliveryUrl(payload: string): string {
  const [ivValue, tagValue, ciphertextValue] = payload.split('.')
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('EMAIL_DELIVERY_PAYLOAD_INVALID')

  try {
    const decipher = createDecipheriv(algorithm, encryptionKey(), Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('EMAIL_DELIVERY_PAYLOAD_INVALID')
  }
}
