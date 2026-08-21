# Render API and worker Blueprint

Volt deploys as three Render services from one repository: a public static web
site, a public Fastify API, and a private simulation worker. The API and worker
share the existing MongoDB Atlas replica-set database through a Render
environment-variable group; Render does not provision or migrate that database.

The API is a web service because the browser and Better Auth need a public HTTPS
origin. The worker is a worker service because it has no HTTP surface and must be
restartable independently while it drains queued simulations. Both services
build the checked-in TypeScript output and start with Node directly, avoiding a
development watcher in production.

Render injects `PORT` for web services. The API therefore binds to
`0.0.0.0:$PORT` in Render and retains `API_HOST`/`API_PORT` for local
development. `WEB_ORIGIN`, `BETTER_AUTH_URL`, and `VITE_API_BASE_URL` remain
Dashboard-provided values because their final origins depend on the deployed
service URLs.

The Blueprint deliberately references the existing Atlas database rather than
creating a second datastore. A production deployment must use a replica set,
fill all `sync: false` values, and verify `/health` before accepting traffic.
