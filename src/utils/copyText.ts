/** Copies text through the modern clipboard API, with a browser fallback. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Continue to the selection-based fallback below.
    }
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false

  const fallbackInput = document.createElement('textarea')
  fallbackInput.className = 'day-type-copy-fallback'
  fallbackInput.value = text
  fallbackInput.setAttribute('readonly', '')
  document.body.appendChild(fallbackInput)
  fallbackInput.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    fallbackInput.remove()
  }

  return copied
}
