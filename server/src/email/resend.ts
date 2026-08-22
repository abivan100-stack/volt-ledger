import { Resend } from 'resend'
import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../config/env.js'
import { getEmailDeliveryConfigurationError } from './config.js'
import { announceCode, announceLink } from './devLinks.js'
import type { InvitationRole } from '../db/models.js'

let resendClient: Resend | undefined
let smtpTransporter: Transporter | undefined

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

function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD)
}

function getSmtpTransporter(): Transporter {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD are required')
  }

  smtpTransporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT === 587,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  })

  return smtpTransporter
}

function smtpError(error: unknown): EmailDeliveryError {
  const candidate = error as { code?: unknown; responseCode?: unknown; message?: unknown }
  const code = typeof candidate.code === 'string' ? candidate.code : 'SMTP_SEND_FAILED'
  const responseCode = typeof candidate.responseCode === 'number' ? candidate.responseCode : undefined
  const retryable =
    responseCode === undefined
      ? ['ECONNECTION', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ESOCKET'].includes(code)
      : responseCode >= 400 && responseCode < 500
  const message = typeof candidate.message === 'string' ? candidate.message : 'SMTP email failed'
  return new EmailDeliveryError(`SMTP email failed: ${message}`, code, retryable)
}

async function sendSmtpEmail(input: {
  to: string
  from: string
  subject: string
  text: string
  html: string
  idempotencyKey?: string
}): Promise<void> {
  try {
    const result = await getSmtpTransporter().sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      messageId: input.idempotencyKey ? `<${input.idempotencyKey}@volt.local>` : undefined,
    })

    if (result.rejected.length > 0) {
      throw new EmailDeliveryError(
        `SMTP rejected recipient: ${result.rejected.join(', ')}`,
        'SMTP_RECIPIENT_REJECTED',
        false,
      )
    }
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error
    throw smtpError(error)
  }
}

export function isEmailDeliveryConfigured(): boolean {
  return !getEmailDeliveryConfigurationError({
    nodeEnv: env.NODE_ENV,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
  })
}

function requireEmailDeliveryConfiguration(): string {
  const error = getEmailDeliveryConfigurationError({
    nodeEnv: env.NODE_ENV,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
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

  const safeUrl = escapeHtml(url)

  if (isSmtpConfigured()) {
    await sendSmtpEmail({
      from: emailFrom,
      to,
      subject: 'Verify your Volt account',
      text: `Verify your Volt account by opening this link:\n${url}`,
      html: `<p>Verify your Volt account to continue.</p><p><a href="${safeUrl}">Verify email address</a></p>`,
    })
    return
  }

  const client = getResendClient()

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

export interface VerificationCodeEmailInput {
  to: string
  code: string
  /** Minutes the code remains valid, stated in the message so it is actionable. */
  expiresInMinutes: number
}

/**
 * The verification code.
 *
 * The code is in the body and never in the subject line: subjects are shown in
 * notifications and previews, which is the one place a shoulder-surfer or a
 * synced smartwatch will read it without the recipient opening anything.
 */
export async function sendVerificationCodeEmail({
  to,
  code,
  expiresInMinutes,
}: VerificationCodeEmailInput): Promise<void> {
  let emailFrom: string
  try {
    emailFrom = requireEmailDeliveryConfiguration()
  } catch (error) {
    // Classified like every other failure here, so a caller retrying on
    // `EmailDeliveryError.retryable` does not have to special-case a plain
    // `Error` to know a missing key will not fix itself on attempt two.
    const message = error instanceof Error ? error.message : 'Email delivery is not configured'
    throw new EmailDeliveryError(message, 'EMAIL_DELIVERY_NOT_CONFIGURED', false)
  }

  announceCode('Volt verification code', to, code)

  const safeCode = escapeHtml(code)
  const subject = 'Your Volt verification code'
  const text = `Your Volt verification code is ${code}.\nIt expires in ${expiresInMinutes} minutes. If you did not ask to verify this address, ignore this email.`
  const html = `<p>Your Volt verification code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${safeCode}</p><p>It expires in ${expiresInMinutes} minutes. If you did not ask to verify this address, ignore this email.</p>`

  if (isSmtpConfigured()) {
    await sendSmtpEmail({ from: emailFrom, to, subject, text, html })
    return
  }

  const { error } = await getResendClient().emails.send({ from: emailFrom, to, subject, text, html })

  if (error) {
    // Matches sendOrganisationInvitationEmail's classification: a 5xx, a 429,
    // or no status at all (a network failure before Resend answered) is worth
    // retrying; anything else — a rejected address, a bad request — is not.
    const retryable = error.statusCode === null || error.statusCode >= 500 || error.statusCode === 429
    throw new EmailDeliveryError(`Resend email failed: ${error.message}`, error.name, retryable)
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

  const safeOrganisationName = escapeHtml(organisationName)
  const safeUrl = escapeHtml(url)
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)

  if (isSmtpConfigured()) {
    await sendSmtpEmail({
      from: emailFrom,
      to,
      subject: `You're invited to ${organisationName} on Volt`,
      text: `You have been invited to join ${organisationName} on Volt as a ${role}. Accept the invitation here:\n${url}`,
      html: `<p>You have been invited to join <strong>${safeOrganisationName}</strong> on Volt as a ${roleLabel}.</p><p><a href="${safeUrl}">Accept invitation</a></p>`,
      idempotencyKey,
    })
    return
  }

  const client = getResendClient()

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
