// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import ChainLedger from '../ChainLedger'
import { useEnergyStore } from '../../../store/useEnergyStore'

const pristine = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
  useEnergyStore.getState().start()
  useEnergyStore.getState().stop()
})

afterEach(() => {
  cleanup()
})

function newestBlockId(): number {
  const chain = useEnergyStore.getState().chain
  return chain[chain.length - 1].id
}

function rowFor(blockId: number): HTMLElement {
  const rows = document.querySelectorAll<HTMLElement>('.chain-row')
  const target = Array.from(rows).find((row) => {
    const time = row.querySelector<HTMLElement>('.chain-row-time')?.textContent
    const block = useEnergyStore.getState().chain.find((b) => b.id === blockId)
    return time === block?.payload.t
  })
  if (!target) throw new Error(`no row for block ${blockId}`)
  return target
}

describe('ChainLedger tamper flow', () => {
  it('shows a sealed ledger with a tamper button per row', () => {
    render(<ChainLedger />)
    expect(screen.getByText(/TAMPER TEST/i)).toBeTruthy()
    expect(document.querySelectorAll('button[title="Tamper: edit this figure"]').length).toBeGreaterThan(0)
    expect(screen.queryByText('INTEGRITY VOID')).toBeNull()
    expect(document.querySelector('.chain-reseal-button')).toBeNull()
  })

  it('tampering a block voids the chain and offers re-seal', () => {
    render(<ChainLedger />)
    const targetId = newestBlockId()
    const row = rowFor(targetId)

    fireEvent.click(row.querySelector<HTMLElement>('button[title="Tamper: edit this figure"]')!)
    const input = row.querySelector<HTMLInputElement>('.chain-row-edit-input')
    expect(input).not.toBeNull()
    expect(useEnergyStore.getState().editingBlockId).toBe(targetId)

    fireEvent.change(input!, { target: { value: '9.99' } })
    fireEvent.blur(input!)

    expect(useEnergyStore.getState().compromised).toBe(true)
    const block = useEnergyStore.getState().chain.find((b) => b.id === targetId)
    expect(block?.tampered).toBe(true)
    expect(block?.payload.kwh).toBe(9.99)

    expect(screen.getByText('INTEGRITY VOID')).toBeTruthy()
    expect(document.querySelector('.chain-reseal-button')).not.toBeNull()
    expect(row.querySelector('.chain-void-badge')).not.toBeNull()
  })

  it('re-sealing restores the original block and clears the void state', () => {
    render(<ChainLedger />)
    const targetId = newestBlockId()
    const origKwh = useEnergyStore.getState().chain.find((b) => b.id === targetId)?.payload.kwh

    const row = rowFor(targetId)
    fireEvent.click(row.querySelector<HTMLElement>('button[title="Tamper: edit this figure"]')!)
    const input = row.querySelector<HTMLInputElement>('.chain-row-edit-input')
    fireEvent.change(input!, { target: { value: '3.33' } })
    fireEvent.blur(input!)

    expect(useEnergyStore.getState().compromised).toBe(true)

    const reseal = document.querySelector<HTMLElement>('.chain-reseal-button')
    act(() => reseal?.click())

    expect(useEnergyStore.getState().compromised).toBe(false)
    const block = useEnergyStore.getState().chain.find((b) => b.id === targetId)
    expect(block?.tampered).toBe(false)
    expect(block?.payload.kwh).toBe(origKwh)
    expect(screen.queryByText('INTEGRITY VOID')).toBeNull()
    expect(document.querySelector('.chain-reseal-button')).toBeNull()
  })
})
