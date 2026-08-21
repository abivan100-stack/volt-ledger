# Resend verified sender for production email

Volt uses Resend for account verification and organisation invitations. The
`onboarding@resend.dev` sender is a provider test sender and Resend limits it to
the account owner's address. It must not be treated as production delivery.

Production therefore requires `EMAIL_FROM` to use an address on a domain that
has been verified in the Resend dashboard. Development may keep the test sender
so local link announcements and provider tests remain convenient. When the
production sender is still `resend.dev`, Volt reports email delivery as
unconfigured and does not enable sign-up that would fail for other recipients.
