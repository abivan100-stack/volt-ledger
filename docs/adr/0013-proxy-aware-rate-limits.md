# Proxy-aware, separated rate limits

Volt applies three request budgets: a general API budget of 300 requests per
client per minute, a 60-request health budget, and a 20-request authentication
budget. Health checks and authentication therefore cannot exhaust the general
API budget or each other's budget.

The rate-limit key is Fastify's resolved `request.ip`. Local development keeps
forwarded-header trust disabled. The Render Blueprint sets `TRUST_PROXY=true`
because Render terminates the public connection and forwards the client
identity; trusting forwarded headers is only safe when the service is reachable
through that managed proxy boundary.
