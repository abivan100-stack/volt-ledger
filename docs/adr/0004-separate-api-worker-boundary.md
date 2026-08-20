# Separate API and simulation worker

Volt will retain its Vite client and add a separate TypeScript REST API with a background simulation worker. This avoids a disruptive client rewrite and keeps authenticated, quota-controlled Monte Carlo work outside request-response limits.

The API reserves one daily simulation-run unit per organisation in MongoDB before enqueueing a run. Reservations and queue inserts occur in one transaction, use UTC calendar days, and are bounded by `SIMULATION_DAILY_RUN_LIMIT` (default `100`). Quota exhaustion is reported as HTTP `429` with a reset timestamp so clients can retry after the next UTC midnight.
