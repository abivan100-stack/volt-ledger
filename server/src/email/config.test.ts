import { describe, expect, it } from 'vitest'
import { getEmailDeliveryConfigurationError } from './config.js'

describe('getEmailDeliveryConfigurationError', () => {
  it('allows the Resend test sender outside production', () => {
    expect(
      getEmailDeliveryConfigurationError({
        nodeEnv: 'development',
        resendApiKey: 're_test_key',
        emailFrom: 'onboarding@resend.dev',
      }),
    ).toBeUndefined()
  })

  it('rejects the Resend test sender in production', () => {
    expect(
      getEmailDeliveryConfigurationError({
        nodeEnv: 'production',
        resendApiKey: 're_live_key',
        emailFrom: 'Volt <onboarding@resend.dev>',
      }),
    ).toBe(
      'EMAIL_FROM must use a verified Resend domain in production; onboarding@resend.dev can only deliver to the Resend account owner.',
    )
  })

  it('allows a sender on a verified domain in production', () => {
    expect(
      getEmailDeliveryConfigurationError({
        nodeEnv: 'production',
        resendApiKey: 're_live_key',
        emailFrom: 'Volt <no-reply@volt.example>',
      }),
    ).toBeUndefined()
  })

  it('reports missing delivery credentials', () => {
    expect(
      getEmailDeliveryConfigurationError({
        nodeEnv: 'production',
        resendApiKey: undefined,
        emailFrom: undefined,
      }),
    ).toBe('RESEND_API_KEY and EMAIL_FROM are required for email delivery.')
  })

  it('allows Gmail SMTP without a Resend API key', () => {
    expect(
      getEmailDeliveryConfigurationError({
        nodeEnv: 'production',
        emailFrom: 'Volt <abivan100@gmail.com>',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        smtpUser: 'abivan100@gmail.com',
        smtpPassword: 'app-password',
      }),
    ).toBeUndefined()
  })

  it('rejects partially configured SMTP credentials', () => {
    expect(
      getEmailDeliveryConfigurationError({
        nodeEnv: 'development',
        resendApiKey: 're_test_key',
        emailFrom: 'onboarding@resend.dev',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
      }),
    ).toBe('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD must be provided together.')
  })
})
