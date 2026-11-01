function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoking in the same tick as click() can cancel the download in browsers
  // that read the blob on a later task (Firefox, Safari). One task is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Triggers a browser download of in-memory text content — no server round-trip. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  triggerDownload(filename, new Blob([content], { type: mimeType }))
}

/** Triggers a browser download of an in-memory binary blob (e.g. a generated PDF). */
export function downloadBlob(filename: string, blob: Blob): void {
  triggerDownload(filename, blob)
}
