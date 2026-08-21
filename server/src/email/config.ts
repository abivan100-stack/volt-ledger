export interface EmailDeliveryConfiguration {
  nodeEnv: string
  resendApiKey?: string
  emailFrom?: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPassword?: string
}

function senderAddress(emailFrom: string): string {
  const displayAddress = emailFrom.match(/<([^<>]+)>/)?.[1]
  return (displayAddress ?? emailFrom).trim().toLowerCase()
}

function usesResendTestDomain(emailFrom: string): boolean {
  return senderAddress(emailFrom).endsWith('@resend.dev')
}

export function getEmailDeliveryConfigurationError(
  configuration: EmailDeliveryConfiguration,
): string | undefined {
  const smtpValues = [
    configuration.smtpHost,
    configuration.smtpPort,
    configuration.smtpUser,
    configuration.smtpPassword,
  ]
  const configuredSmtpValues = smtpValues.filter((value) => value !== undefined)
  const smtpConfigured = configuredSmtpValues.length === smtpValues.length

  if (configuredSmtpValues.length > 0 && !smtpConfigured) {
    return 'SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD must be provided together.'
  }

  if (!configuration.emailFrom) {
    return 'RESEND_API_KEY and EMAIL_FROM are required for email delivery.'
  }

  if (!smtpConfigured && !configuration.resendApiKey) {
    return 'RESEND_API_KEY and EMAIL_FROM are required for email delivery.'
  }

  if (!smtpConfigured && configuration.nodeEnv === 'production' && usesResendTestDomain(configuration.emailFrom)) {
    return 'EMAIL_FROM must use a verified Resend domain in production; onboarding@resend.dev can only deliver to the Resend account owner.'
  }

  return undefined
}
