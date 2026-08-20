import { describe, expect, it } from 'vitest'
import { DOCUMENTED_ROUTES, DOCUMENT_VERSION, OPENAPI_VERSION, buildOpenApiDocument } from './document.js'
import { REQUEST_SCHEMAS, RESPONSE_SCHEMAS } from './registry.js'

type JsonObject = Record<string, unknown>

const document = buildOpenApiDocument() as {
  openapi: string
  info: JsonObject
  servers: JsonObject[]
  tags: JsonObject[]
  components: { securitySchemes: JsonObject; schemas: Record<string, JsonObject> }
  paths: Record<string, Record<string, JsonObject>>
}

function operations(): Array<[string, string, JsonObject]> {
  const found: Array<[string, string, JsonObject]> = []
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      found.push([path, method, operation])
    }
  }
  return found
}

/** Every `$ref` string anywhere in the document. */
function collectRefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectRefs(entry, found)
    return found
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (key === '$ref' && typeof entry === 'string') found.push(entry)
      else collectRefs(entry, found)
    }
  }
  return found
}

/** The documented operation, failing loudly when the route is absent. */
function operation(path: string, method: string): JsonObject {
  const documented = document.paths[path]?.[method]
  if (!documented) throw new Error(`No ${method.toUpperCase()} ${path} in the document`)
  return documented
}

/** Reads a request body example, failing with a useful message rather than a TypeError. */
function requestExample(source: JsonObject | undefined): unknown {
  if (!source) throw new Error('No operation documented')
  const content = (source.requestBody as JsonObject).content as JsonObject
  return (content['application/json'] as JsonObject).example
}

/** Reads a nested key, failing with a useful message rather than a TypeError. */
function jsonExample(source: JsonObject | undefined, status: string): unknown {
  if (!source) throw new Error(`No operation documented for status ${status}`)
  const response = (source.responses as JsonObject)[status] as JsonObject | undefined
  if (!response) throw new Error(`No ${status} response documented`)
  const content = (response.content as JsonObject)['application/json'] as JsonObject
  return content.example
}

describe('document shape', () => {
  it('declares OpenAPI 3.1, whose JSON Schema dialect matches what Zod emits', () => {
    expect(document.openapi).toBe(OPENAPI_VERSION)
    expect(OPENAPI_VERSION.startsWith('3.1')).toBe(true)
  })

  it('carries a version that can be bumped on a contract change', () => {
    expect(document.info.version).toBe(DOCUMENT_VERSION)
    expect(DOCUMENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('accepts an override for the published server URL and version', () => {
    const custom = buildOpenApiDocument({ serverUrl: 'https://api.example', version: '2.0.0' }) as typeof document
    expect(custom.servers[0]?.url).toBe('https://api.example')
    expect(custom.info.version).toBe('2.0.0')
  })

  it('states that the data is synthetic', () => {
    expect(String(document.info.description)).toMatch(/all data is synthetic/i)
  })

  it('documents the cookie session scheme and the CSRF requirement', () => {
    const scheme = document.components.securitySchemes.sessionCookie as JsonObject
    expect(scheme.type).toBe('apiKey')
    expect(scheme.in).toBe('cookie')
    expect(String(document.info.description)).toMatch(/Origin.*Referer/s)
  })
})

describe('paths', () => {
  it('uses OpenAPI brace parameters, never Fastify colons', () => {
    for (const path of Object.keys(document.paths)) {
      expect(path).not.toMatch(/:/)
    }
    expect(document.paths['/api/v1/organisations/{organisationId}']).toBeDefined()
  })

  it('documents one operation per route in the table', () => {
    expect(operations()).toHaveLength(DOCUMENTED_ROUTES.length)
  })

  it('gives every operation a unique operationId', () => {
    const ids = operations().map(([, , operation]) => operation.operationId as string)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every operation a summary, description, tag and responses', () => {
    for (const [path, method, operation] of operations()) {
      const where = `${method.toUpperCase()} ${path}`
      expect(operation.summary, where).toBeTruthy()
      expect(operation.description, where).toBeTruthy()
      expect(operation.tags, where).toBeTruthy()
      expect(Object.keys(operation.responses as JsonObject).length, where).toBeGreaterThan(0)
    }
  })

  it('declares every path parameter the path contains', () => {
    for (const [path, method, operation] of operations()) {
      const inPath = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1])
      const declared = ((operation.parameters as JsonObject[]) ?? [])
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name)
      expect(declared.sort(), `${method.toUpperCase()} ${path}`).toEqual(inPath.sort())
    }
  })
})

describe('authentication and roles', () => {
  it('declares each operation as either public or cookie-authenticated', () => {
    for (const [path, , operation] of operations()) {
      const security = operation.security as unknown[]
      const authenticated = security.length > 0
      expect(authenticated ? security : [], path).toEqual(
        authenticated ? [{ sessionCookie: [] }] : [],
      )
    }
  })

  it('leaves only the two descriptive routes public', () => {
    const publicPaths = operations()
      .filter(([, , operation]) => (operation.security as unknown[]).length === 0)
      .map(([path]) => path)
      .sort()
    // Both describe the service rather than exposing any organisation's data.
    expect(publicPaths).toEqual(['/health', '/openapi.json'])
  })

  it('documents a 401 on every authenticated route', () => {
    for (const [path, method, operation] of operations()) {
      if ((operation.security as unknown[]).length === 0) continue
      const responses = operation.responses as JsonObject
      expect(responses['401'], `${method.toUpperCase()} ${path}`).toBeDefined()
      expect(String((responses['401'] as JsonObject).description)).toMatch(/UNAUTHENTICATED/)
    }
  })

  it('names the permitted roles on organisation-scoped routes', () => {
    const scoped = operations().filter(([path]) => path.includes('{organisationId}'))
    expect(scoped.length).toBeGreaterThan(0)
    for (const [path, method, operation] of scoped) {
      expect(String(operation.description), `${method.toUpperCase()} ${path}`).toMatch(/\*\*Roles\.\*\*/)
    }
  })

  it('documents both organisation 403 codes on scoped routes', () => {
    for (const [path, , operation] of operations()) {
      if (!path.includes('{organisationId}')) continue
      const forbidden = (operation.responses as JsonObject)['403'] as JsonObject
      expect(String(forbidden.description), path).toMatch(/ORGANISATION_ACCESS_DENIED/)
      expect(String(forbidden.description), path).toMatch(/ORGANISATION_ROLE_FORBIDDEN/)
    }
  })
})

describe('errors', () => {
  it('points every /api/v1 error response at the shared envelope', () => {
    for (const [path, method, operation] of operations()) {
      // /health is deliberately outside the envelope: its 503 reports which
      // dependency is unavailable rather than an error code.
      if (!path.startsWith('/api/v1')) continue
      for (const [status, response] of Object.entries(operation.responses as JsonObject)) {
        if (Number(status) < 400) continue
        const schema = ((response as JsonObject).content as JsonObject | undefined)?.[
          'application/json'
        ] as JsonObject | undefined
        expect(schema, `${method.toUpperCase()} ${path} ${status}`).toBeDefined()
        const ref = ((schema as JsonObject).schema as JsonObject).$ref as string
        expect(ref, `${method.toUpperCase()} ${path} ${status}`).toMatch(
          /(ErrorResponse|QuotaErrorResponse)$/,
        )
      }
    }
  })

  it('keeps the health degraded response outside the error envelope', () => {
    const degraded = (operation('/health', 'get').responses as JsonObject)['503'] as JsonObject
    const schema = ((degraded.content as JsonObject)['application/json'] as JsonObject).schema
    expect(schema).toEqual({ $ref: '#/components/schemas/HealthDegradedResponse' })
  })

  it('describes the quota rejection with its allowance and Retry-After header', () => {
    const queue = operation('/api/v1/organisations/{organisationId}/simulations', 'post')
    const tooMany = (queue.responses as JsonObject)['429'] as JsonObject
    expect(String(tooMany.description)).toMatch(/SIMULATION_QUOTA_EXCEEDED/)
    expect(tooMany.headers).toHaveProperty('Retry-After')
    expect(((tooMany.content as JsonObject)['application/json'] as JsonObject).schema).toEqual({
      $ref: '#/components/schemas/QuotaErrorResponse',
    })
  })

  it('lists each documented code exactly once per status', () => {
    for (const [path, method, operation] of operations()) {
      for (const [status, response] of Object.entries(operation.responses as JsonObject)) {
        if (Number(status) < 400) continue
        const codes = [...String((response as JsonObject).description).matchAll(/`([A-Z_]+)`/g)].map(
          (match) => match[1],
        )
        expect(new Set(codes).size, `${method.toUpperCase()} ${path} ${status}`).toBe(codes.length)
      }
    }
  })
})

describe('components', () => {
  it('exposes every registered request and response schema', () => {
    const names = Object.keys(document.components.schemas)
    for (const name of Object.keys(REQUEST_SCHEMAS)) expect(names).toContain(name)
    for (const name of Object.keys(RESPONSE_SCHEMAS)) expect(names).toContain(name)
  })

  it('resolves every $ref used anywhere in the document', () => {
    const names = new Set(Object.keys(document.components.schemas))
    for (const ref of collectRefs(document)) {
      expect(ref.startsWith('#/components/schemas/'), ref).toBe(true)
      expect(names.has(ref.replace('#/components/schemas/', '')), ref).toBe(true)
    }
  })

  it('leaves no standalone-document keys on a component', () => {
    for (const [name, schema] of Object.entries(document.components.schemas)) {
      expect(schema, name).not.toHaveProperty('$schema')
      expect(schema, name).not.toHaveProperty('$id')
    }
  })

  it('treats defaulted request fields as optional, since the caller may omit them', () => {
    const request = document.components.schemas.CreateSimulationRequest as {
      required: string[]
      properties: JsonObject
    }
    expect(request.required).toEqual(['seed', 'simulationDate', 'dayType', 'households'])
    expect(Object.keys(request.properties)).toContain('sampleCount')
  })

  it('treats defaulted response fields as always present', () => {
    const response = document.components.schemas.SimulationQuota as { required: string[] }
    expect(response.required).toContain('remaining')
  })

  it('rejects unknown keys on strict request bodies', () => {
    const request = document.components.schemas.CreateOrganisationRequest as JsonObject
    expect(request.additionalProperties).toBe(false)
  })
})

describe('documented behaviour that JSON Schema cannot express', () => {
  it('states the settlement idempotency rule', () => {
    const settle =
      operation('/api/v1/organisations/{organisationId}/simulations/{runId}/settlement', 'post')
    const description = String(settle?.description)
    expect(description).toMatch(/Idempotency/)
    expect(description).toMatch(/alreadySettled/)
    expect(description).toMatch(/different.*outcome.*refused/is)
  })

  it('states the adjustment idempotency rule and that the target is never modified', () => {
    const adjust = operation('/api/v1/organisations/{organisationId}/ledger/adjustments', 'post')
    const description = String(adjust?.description)
    expect(description).toMatch(/idempotencyKey/)
    expect(description).toMatch(/alreadyApplied/)
    expect(description).toMatch(/never modified/i)
  })

  it('states how cursor pagination behaves', () => {
    const audit = operation('/api/v1/organisations/{organisationId}/audit-events', 'get')
    const description = String(audit?.description)
    expect(description).toMatch(/nextCursor/)
    expect(description).toMatch(/null on the last page/i)
    expect(description).toMatch(/carries no authorization/i)
    expect(description).toMatch(/retained for provenance/i)
  })

  it('states that a queued run is not a computed one', () => {
    const queue = operation('/api/v1/organisations/{organisationId}/simulations', 'post')
    expect(String(queue?.description)).toMatch(/queued/i)
    expect(String(queue?.description)).toMatch(/worker/i)
  })

  it('states that archiving is soft and retains ledger history', () => {
    const archive = operation('/api/v1/organisations/{organisationId}', 'delete')
    const description = String(archive?.description)
    expect(description).toMatch(/retained for provenance/i)
    expect(description).toMatch(/no undo/i)
  })
})

describe('examples', () => {
  it('gives the simulation queue route a request and response example', () => {
    const queue = operation('/api/v1/organisations/{organisationId}/simulations', 'post')
    expect((requestExample(queue) as JsonObject).dayType).toBe('sunny-weekday')
    expect(jsonExample(queue, '202')).toBeDefined()
  })

  it('gives the ledger routes settlement and adjustment examples', () => {
    const ledger = operation('/api/v1/organisations/{organisationId}/ledger', 'get')
    const listExample = jsonExample(ledger, '200') as {
      events: JsonObject[]
      integrity: JsonObject
    }
    expect(listExample.events[0]?.canonicalSeal).toBeTruthy()
    expect(listExample.integrity.valid).toBe(true)

    const adjust = operation('/api/v1/organisations/{organisationId}/ledger/adjustments', 'post')
    const example = jsonExample(adjust, '201') as {
      adjustment: { event: JsonObject }
    }
    // A correction links to its target and never replaces it.
    expect(example.adjustment.event.eventType).toBe('adjustment')
    expect(example.adjustment.event.adjustmentTargetEventId).toBeTruthy()
  })

  it('keeps every example parseable by the schema it illustrates', async () => {
    const { ledgerListResponseSchema, settlementResponseSchema, adjustmentResponseSchema, simulationRunResponseSchema } =
      await import('../http/responses.js')
    const { createSimulationSchema } = await import('../http/schemas.js')

    const queue = operation('/api/v1/organisations/{organisationId}/simulations', 'post')
    expect(createSimulationSchema.safeParse(requestExample(queue)).success).toBe(true)
    expect(simulationRunResponseSchema.safeParse(jsonExample(queue, '202')).success).toBe(true)

    const ledger = operation('/api/v1/organisations/{organisationId}/ledger', 'get')
    expect(ledgerListResponseSchema.safeParse(jsonExample(ledger, '200')).success).toBe(true)

    const settlementPath =
      operation('/api/v1/organisations/{organisationId}/simulations/{runId}/settlement', 'post')
    for (const status of ['201', '200']) {
      const example = jsonExample(settlementPath, status)
      expect(settlementResponseSchema.safeParse(example).success, status).toBe(true)
    }

    const adjustPath = operation('/api/v1/organisations/{organisationId}/ledger/adjustments', 'post')
    expect(adjustmentResponseSchema.safeParse(jsonExample(adjustPath, '201')).success).toBe(true)
  })
})
