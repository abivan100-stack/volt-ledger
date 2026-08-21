export interface EmailDeliveryConfiguration {
  nodeEnv: string
  resendApiKey?: string
  emailFrom?: string
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
  if (!configuration.resendApiKey || !configuration.emailFrom) {
    return 'RESEND_API_KEY and EMAIL_FROM are required for email delivery.'
  }

  if (configuration.nodeEnv === 'production' && usesResendTestDomain(configuration.emailFrom)) {
    return 'EMAIL_FROM must use a verified Resend domain in production; onboarding@resend.dev can only deliver to the Resend account owner.'
  }

  return undefined
}
