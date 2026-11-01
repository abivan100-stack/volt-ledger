// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from '../downloadFile'

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('revokes the object URL after the click, not in the same tick', () => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:volt-ledger')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadTextFile('ledger.csv', 'id,kwh', 'text/csv')

    // The click has been dispatched while the blob is still addressable, which
    // is the whole point: Firefox resolves the download on a later task.
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:volt-ledger')
  })
})
