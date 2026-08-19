// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import SimulationControls from '../SimulationControls'
import { useEnergyStore } from '../../../store/useEnergyStore'

const pristine = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
})

afterEach(() => {
  useEnergyStore.getState().stop()
  cleanup()
})

describe('SimulationControls', () => {
  it('pauses and resumes the simulation with an announced state', () => {
    useEnergyStore.getState().start()
    render(<SimulationControls />)

    const toggle = screen.getByRole('button', { name: 'PAUSE SIMULATION' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(useEnergyStore.getState().running).toBe(false)
    expect(screen.getByText(/SIM DAY 01.*PAUSED/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'RESUME SIMULATION' }))
    expect(useEnergyStore.getState().running).toBe(true)
  })

  it('sets only a supported speed and exposes the selected speed semantically', () => {
    render(<SimulationControls />)
    const speedEight = screen.getByRole('button', { name: '×8' })
    fireEvent.click(speedEight)
    expect(useEnergyStore.getState().config.simSpeed).toBe(8)
    expect(speedEight.getAttribute('aria-pressed')).toBe('true')
  })

  it('resets a live, tampered scenario while keeping it running', () => {
    useEnergyStore.getState().start()
    const target = useEnergyStore.getState().chain[0]
    useEnergyStore.getState().startEdit(target.id)
    useEnergyStore.getState().setEditValue('9.99')
    useEnergyStore.getState().commitEdit()
    expect(useEnergyStore.getState().compromised).toBe(true)

    render(<SimulationControls />)
    fireEvent.click(screen.getByRole('button', { name: 'RESET SCENARIO' }))

    const state = useEnergyStore.getState()
    expect(state.running).toBe(true)
    expect(state.compromised).toBe(false)
    expect(state.invalidCount).toBe(0)
    expect(state.simDay).toBe(1)
    expect(state.chain).toHaveLength(9)
  })
})
