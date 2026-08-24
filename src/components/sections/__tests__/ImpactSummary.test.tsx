// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ImpactSummary from '../ImpactSummary'
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

describe('ImpactSummary', () => {
  it('shows ledger-derived community value alongside the stated grid comparisons', () => {
    useEnergyStore.setState({
      totalKwhToday: 10,
      totalCreditToday: 55,
      dailyBreakdown: { solarPct: 30, batteryPct: 20, tradePct: 15, gridPct: 35 },
    })

    render(<ImpactSummary />)

    expect(screen.getByRole('heading', { name: /the case for volt/i })).toBeTruthy()
    expect(screen.getByText('₹55.00')).toBeTruthy()
    expect(screen.getAllByText('₹25.00')).toHaveLength(2)
    expect(screen.getByText('7.1 kg')).toBeTruthy()
    expect(screen.getByText('65%')).toBeTruthy()
    expect(screen.getByText(/illustrative synthetic scenario only/i)).toBeTruthy()
  })

  it('reports the exact number of current chain records as proof context', () => {
    const chainLength = useEnergyStore.getState().chain.length
    render(<ImpactSummary />)

    expect(screen.getByText(new RegExp(`${chainLength} SHA-256 SEALED`, 'i'))).toBeTruthy()
  })
})
