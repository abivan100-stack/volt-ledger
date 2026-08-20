import { Resend } from 'resend'
import { env } from '../config/env.js'

let resendClient: Resend | undefined

export interface VerificationEmailInput {
  to: string
  url: string
}

function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  resendClient ??= new Resend(env.RESEND_API_KEY)
  return resendClient
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  )
}

export async function sendVerificationEmail({ to, url }: VerificationEmailInput): Promise<void> {
  if (!env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not configured')
  }

  const client = getResendClient()
  const safeUrl = escapeHtml(url)

  const { error } = await client.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Verify your Volt account',
    text: `Verify your Volt account by opening this link:\n${url}`,
    html: `<p>Verify your Volt account to continue.</p><p><a href="${safeUrl}">Verify email address</a></p>`,
  })

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`)
  }
}
