# Separate API and simulation worker

Volt will retain its Vite client and add a separate TypeScript REST API with a background simulation worker. This avoids a disruptive client rewrite and keeps authenticated, quota-controlled Monte Carlo work outside request-response limits.
