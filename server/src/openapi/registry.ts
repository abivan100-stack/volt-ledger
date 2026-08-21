import { z } from 'zod'
import * as requests from '../http/schemas.js'
import * as responses from '../http/responses.js'

/**
 * Names every schema that appears in the OpenAPI document's
 * `components.schemas`, so paths can `$ref` them instead of inlining copies.
 *
 * Requests and responses are converted separately because they need opposite
 * conversion modes: a request is documented as it arrives (`input`, where a
 * field with a `.default()` is optional), a response as it is sent (`output`,
 * where that same field is always present).
 */

export const REQUEST_SCHEMAS = {
  CreateOrganisationRequest: requests.createOrganisationSchema,
  CreateSimulationRequest: requests.createSimulationSchema,
  SettleSimulationRequest: requests.settleSimulationSchema,
  CreateAdjustmentRequest: requests.createAdjustmentSchema,
  TransferOwnershipRequest: requests.transferOwnershipSchema,
  UpdateMembershipRoleRequest: requests.updateMembershipRoleSchema,
  CreateInvitationRequest: requests.createInvitationBodySchema,
  AcceptInvitationRequest: requests.acceptInvitationBodySchema,
} as const

export const RESPONSE_SCHEMAS = {
  ErrorResponse: responses.errorResponseSchema,
  QuotaErrorResponse: responses.quotaErrorResponseSchema,
  HealthResponse: responses.healthResponseSchema,
  HealthDegradedResponse: responses.healthDegradedResponseSchema,
  SessionResponse: responses.sessionResponseSchema,
  AccountClosureResponse: responses.accountClosureResponseSchema,
  EmailChallengeResponse: responses.emailChallengeResponseSchema,
  Organisation: responses.organisationSchema,
  OrganisationListResponse: responses.organisationListResponseSchema,
  OrganisationResponse: responses.organisationResponseSchema,
  Membership: responses.membershipSchema,
  MembershipListResponse: responses.membershipListResponseSchema,
  MembershipResponse: responses.membershipResponseSchema,
  OwnershipTransferResponse: responses.ownershipTransferResponseSchema,
  Invitation: responses.invitationSchema,
  InvitationListResponse: responses.invitationListResponseSchema,
  InvitationResponse: responses.invitationResponseSchema,
  AcceptInvitationResponse: responses.acceptInvitationResponseSchema,
  SimulationRun: responses.simulationRunSchema,
  SimulationRunResponse: responses.simulationRunResponseSchema,
  SimulationRunListResponse: responses.simulationRunListResponseSchema,
  SimulationQuota: responses.simulationQuotaSchema,
  SimulationQuotaResponse: responses.simulationQuotaResponseSchema,
  SimulationQueue: responses.simulationQueueSchema,
  WorkerLiveness: responses.workerLivenessSchema,
  SimulationQueueResponse: responses.simulationQueueResponseSchema,
  SimulationInterval: responses.simulationIntervalSchema,
  SimulationSummary: responses.simulationSummarySchema,
  SimulationResultsResponse: responses.simulationResultsResponseSchema,
  LedgerEvent: responses.ledgerEventSchema,
  LedgerIntegrity: responses.ledgerIntegritySchema,
  LedgerListResponse: responses.ledgerListResponseSchema,
  SettlementResponse: responses.settlementResponseSchema,
  AdjustmentResponse: responses.adjustmentResponseSchema,
  AuditEvent: responses.auditEventSchema,
  AuditEventPageResponse: responses.auditEventPageResponseSchema,
} as const

export type RequestSchemaName = keyof typeof REQUEST_SCHEMAS
export type ResponseSchemaName = keyof typeof RESPONSE_SCHEMAS
export type SchemaName = RequestSchemaName | ResponseSchemaName

export type JsonSchema = Record<string, unknown>

/** Keys Zod emits that belong to a standalone document, not to a component. */
function stripDocumentKeys(schema: JsonSchema): JsonSchema {
  const { $schema: _schema, $id: _id, ...rest } = schema
  return rest
}

function convert(
  entries: Record<string, z.ZodType>,
  io: 'input' | 'output',
): Record<string, JsonSchema> {
  const registry = z.registry<{ id: string }>()
  for (const [name, schema] of Object.entries(entries)) {
    registry.add(schema, { id: name })
  }

  const converted = z.toJSONSchema(registry, {
    io,
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, JsonSchema> }

  return Object.fromEntries(
    Object.entries(converted.schemas).map(([name, schema]) => [name, stripDocumentKeys(schema)]),
  )
}

/** Every component schema, keyed by the name paths reference it with. */
export function buildComponentSchemas(): Record<string, JsonSchema> {
  return {
    ...convert(REQUEST_SCHEMAS as unknown as Record<string, z.ZodType>, 'input'),
    ...convert(RESPONSE_SCHEMAS as unknown as Record<string, z.ZodType>, 'output'),
  }
}

export function schemaRef(name: SchemaName): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` }
}
