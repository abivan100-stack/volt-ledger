import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOpenApiDocument } from './document.js'

/**
 * Writes the generated document to `docs/openapi.json`.
 *
 * The file is committed so that a change to the published contract shows up in
 * review as a diff, and so consumers can read it without running the API. CI
 * regenerates it and fails if the result differs from what is checked in.
 */

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
export const OPENAPI_OUTPUT_PATH = resolve(REPO_ROOT, 'docs/openapi.json')

/** Stable, newline-terminated JSON so the committed file diffs cleanly. */
export function serializeDocument(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

export async function writeOpenApiDocument(outputPath = OPENAPI_OUTPUT_PATH): Promise<string> {
  const contents = serializeDocument(buildOpenApiDocument())
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, contents, 'utf8')
  return outputPath
}

const invokedDirectly = process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const path = await writeOpenApiDocument()
  process.stdout.write(`Wrote ${path}\n`)
}
