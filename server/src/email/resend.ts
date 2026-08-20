import { Resend } from 'resend'
import { env } from '../config/env.js'
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

  // Before the send, not after: a provider that files the message as spam still
  // leaves a link the developer can open.
  announceLink('Verify your Volt account', to, url)

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

export async function sendOrganisationInvitationEmail({
  to,
  organisationName,
  role,
  url,
}: OrganisationInvitationEmailInput): Promise<void> {
  if (!env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not configured')
  }

  announceLink(`Invitation to ${organisationName}`, to, url)

  const client = getResendClient()
  const safeOrganisationName = escapeHtml(organisationName)
  const safeUrl = escapeHtml(url)
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)

  const { error } = await client.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `You're invited to ${organisationName} on Volt`,
    text: `You have been invited to join ${organisationName} on Volt as a ${role}. Accept the invitation here:\n${url}`,
    html: `<p>You have been invited to join <strong>${safeOrganisationName}</strong> on Volt as a ${roleLabel}.</p><p><a href="${safeUrl}">Accept invitation</a></p>`,
  })

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`)
  }
}
