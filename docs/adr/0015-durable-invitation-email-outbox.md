# Durable invitation email outbox

Organisation invitations are written together with an email-delivery outbox
document in one MongoDB transaction. The HTTP endpoint returns `202 Accepted`
once that transaction commits; it does not make a provider call in the request
and it never revokes a valid invitation merely because a provider is unavailable.

The outbox stores the invitation URL encrypted with a key derived from the
Better Auth secret. The invitation collection continues to store only a SHA-256
hash of the single-use token. A worker claims pending or expired leases with an
atomic update, increments the attempt count, and sends through Resend using a
stable idempotency key. Transient provider and network failures are requeued
with bounded exponential backoff; configuration errors, malformed encrypted
payloads, and deliveries that exhaust the attempt budget are marked failed for
operator inspection. Successful sends are marked sent. This keeps request
latency independent of email-provider availability while avoiding duplicate
messages during worker retries.

This phase covers organisation invitations. Better Auth account-verification
messages remain on their existing synchronous path and should be migrated only
with a separate lifecycle and user-facing status design.
