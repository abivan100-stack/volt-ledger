import { Resend } from 'resend'
import { env } from '../config/env.js'
import { getEmailDeliveryConfigurationError } from './config.js'
import { announceLink } from './devLinks.js'
import type { InvitationRole } from '../db/models.js'

let resendClient: Resend | undefined

export interface VerificationEmailInput {
  to: string
  url: string
}

export interface OrganisationInvitationEmailInput {
  to: string
  organisationName: string
  role: InvitationRole
  url: string
  idempotencyKey?: string
}

export class EmailDeliveryError extends Error {
  readonly retryable: boolean
  readonly code: string

  constructor(message: string, code: string, retryable: boolean) {
    super(message)
    this.name = 'EmailDeliveryError'
    this.code = code
    this.retryable = retryable
  }
}

function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  resendClient ??= new Resend(env.RESEND_API_KEY)
  return resendClient
}

export function isEmailDeliveryConfigured(): boolean {
  return !getEmailDeliveryConfigurationError({
    nodeEnv: env.NODE_ENV,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
  })
}

function requireEmailDeliveryConfiguration(): string {
  const error = getEmailDeliveryConfigurationError({
    nodeEnv: env.NODE_ENV,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
  })

  if (error) throw new Error(error)
  const emailFrom = env.EMAIL_FROM
  if (!emailFrom) throw new Error('EMAIL_FROM is not configured')
  return emailFrom
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
  const emailFrom = requireEmailDeliveryConfiguration()

  // Before the send, not after: a provider that files the message as spam still
  // leaves a link the developer can open.
  announceLink('Verify your Volt account', to, url)

  const client = getResendClient()
  const safeUrl = escapeHtml(url)

  const { error } = await client.emails.send({
    from: emailFrom,
    to,
    subject: 'Verify your Volt account',
    text: `Verify your Volt account by opening this link:\n${url}`,
    html: `<p>Verify your Volt account to continue.</p><p><a href="${safeUrl}">Verify email address</a></p>`,
  })

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`)
  }
}

export async function sendOrganisationInvitationEmail({
  to,
  organisationName,
  role,
  url,
  idempotencyKey,
}: OrganisationInvitationEmailInput): Promise<void> {
  let emailFrom: string
  try {
    emailFrom = requireEmailDeliveryConfiguration()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery is not configured'
    throw new EmailDeliveryError(message, 'EMAIL_DELIVERY_NOT_CONFIGURED', false)
  }

  announceLink(`Invitation to ${organisationName}`, to, url)

  const client = getResendClient()
  const safeOrganisationName = escapeHtml(organisationName)
  const safeUrl = escapeHtml(url)
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)

  const { error } = await client.emails.send({
    from: emailFrom,
    to,
    subject: `You're invited to ${organisationName} on Volt`,
    text: `You have been invited to join ${organisationName} on Volt as a ${role}. Accept the invitation here:\n${url}`,
    html: `<p>You have been invited to join <strong>${safeOrganisationName}</strong> on Volt as a ${roleLabel}.</p><p><a href="${safeUrl}">Accept invitation</a></p>`,
  }, idempotencyKey ? { idempotencyKey } : undefined)

  if (error) {
    const retryable = error.statusCode === null || error.statusCode >= 500 || error.statusCode === 429
    throw new EmailDeliveryError(`Resend email failed: ${error.message}`, error.name, retryable)
  }
}
