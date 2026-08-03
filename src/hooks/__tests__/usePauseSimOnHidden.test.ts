// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePauseSimOnHidden } from '../usePauseSimOnHidden'
import { useEnergyStore } from '../../store/useEnergyStore'

const pristine = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

afterEach(() => {
  useEnergyStore.getState().stop()
})

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('usePauseSimOnHidden', () => {
  it('stops the simulation while the tab is hidden and resumes on return', () => {
    renderHook(() => usePauseSimOnHidden())
    useEnergyStore.getState().start()
    expect(useEnergyStore.getState().running).toBe(true)

    setHidden(true)
    expect(useEnergyStore.getState().running).toBe(false)

    setHidden(false)
    expect(useEnergyStore.getState().running).toBe(true)
  })

  it('does not resume the simulation when it was not running before hiding', () => {
    renderHook(() => usePauseSimOnHidden())
    expect(useEnergyStore.getState().running).toBe(false)

    setHidden(true)
    expect(useEnergyStore.getState().running).toBe(false)

    setHidden(false)
    expect(useEnergyStore.getState().running).toBe(false)
  })
})
