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
})
