function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Triggers a browser download of in-memory text content — no server round-trip. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  triggerDownload(filename, new Blob([content], { type: mimeType }))
}

/** Triggers a browser download of an in-memory binary blob (e.g. a generated PDF). */
export function downloadBlob(filename: string, blob: Blob): void {
  triggerDownload(filename, blob)
}
