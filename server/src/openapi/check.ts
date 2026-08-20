import { readFile } from 'node:fs/promises'
import { Validator } from '@seriousme/openapi-schema-validator'
import { buildOpenApiDocument } from './document.js'
import { OPENAPI_OUTPUT_PATH, serializeDocument } from './write.js'

/**
 * The CI guard over the published contract. It asserts two things:
 *
 *  1. the generated document is a valid OpenAPI 3.1 description, judged by the
 *     official meta-schema rather than by this repository's own expectations;
 *  2. `docs/openapi.json` still matches what the code generates, so the diff
 *     that alters the API also shows what it did to the published description.
 */

export interface CheckResult {
  upToDate: boolean
  reason?: string
}

export async function validateDocument(): Promise<CheckResult> {
  const validator = new Validator()
  const result = await validator.validate(buildOpenApiDocument())
  if (result.valid) return { upToDate: true }
  return {
    upToDate: false,
    reason: [
      'The generated document is not valid OpenAPI 3.1:',
      JSON.stringify(result.errors, null, 2),
    ].join('\n'),
  }
}

/**
 * Compares content, not bytes. A Windows checkout may hold CRLF even though the
 * file is stored and generated with LF, and that is not a contract change.
 */
export function normaliseNewlines(contents: string): string {
  return contents.replace(/\r\n/g, '\n')
}

export async function checkCommittedDocument(path = OPENAPI_OUTPUT_PATH): Promise<CheckResult> {
  const expected = serializeDocument(buildOpenApiDocument())

  let actual: string
  try {
    actual = await readFile(path, 'utf8')
  } catch {
    return { upToDate: false, reason: `${path} is missing. Run: npm run openapi:write` }
  }

  if (normaliseNewlines(actual) !== normaliseNewlines(expected)) {
    return {
      upToDate: false,
      reason: `${path} is out of date. Run: npm run openapi:write`,
    }
  }

  return { upToDate: true }
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith('check.ts')

if (invokedDirectly) {
  const result = await checkCommittedDocument()
  if (!result.upToDate) {
    process.stderr.write(`${result.reason}\n`)
    process.exit(1)
  }
  process.stdout.write('OpenAPI document is up to date.\n')
}
