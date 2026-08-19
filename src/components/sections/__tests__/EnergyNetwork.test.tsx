// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import EnergyNetwork from '../EnergyNetwork'
import { useEnergyStore } from '../../../store/useEnergyStore'
import { shortName } from '../../../lib/energyNetwork'

const pristine = useEnergyStore.getState()

/** happy-dom lays nothing out, so the stage has to be told how big it is. */
function measureStage(width: number, height: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
}

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
  useEnergyStore.getState().start()
  useEnergyStore.getState().stop()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('EnergyNetwork', () => {
  it('frames the graph with a title, a one-line explainer and a legend', () => {
    render(<EnergyNetwork />)

    expect(screen.getByRole('heading', { name: 'Community Energy Network' })).toBeTruthy()
    expect(screen.getByText(/who is generating, who is drawing/i)).toBeTruthy()
    for (const item of ['Producer', 'Consumer', 'Balanced', 'Energy flow']) {
      expect(screen.getByText(item)).toBeTruthy()
    }
  })

  it('draws one node per household, labelled from live store data', () => {
    const { households } = useEnergyStore.getState()
    const { container } = render(<EnergyNetwork />)

    expect(container.querySelectorAll('.net-node')).toHaveLength(households.length)
    for (const household of households) {
      expect(screen.getByText(shortName(household.name).toUpperCase())).toBeTruthy()
    }
  })

  it('reports the live network status and totals, not a fixed caption', () => {
    const { households } = useEnergyStore.getState()
    const generated = households.reduce((sum, h) => sum + h.out, 0)
    const consumed = households.reduce((sum, h) => sum + h.draw, 0)
    const expectedStatus =
      generated - consumed > 0.6
        ? 'Surplus available'
        : generated - consumed < -0.6
          ? 'Demand exceeds supply'
          : 'Network balanced'

    render(<EnergyNetwork />)

    expect(screen.getByText(expectedStatus)).toBeTruthy()
    expect(screen.getByText(generated.toFixed(1))).toBeTruthy()
    expect(screen.getByText(consumed.toFixed(1))).toBeTruthy()
  })

  it('flips a household from producer to consumer when its net flow reverses', () => {
    const { container, rerender } = render(<EnergyNetwork />)
    const first = () => container.querySelector('.net-node')

    useEnergyStore.setState((state) => ({
      households: state.households.map((h, index) => (index === 0 ? { ...h, out: 4, draw: 0.5, net: 3.5 } : h)),
    }))
    rerender(<EnergyNetwork />)
    expect(first()?.className).toContain('net-node-produce')

    useEnergyStore.setState((state) => ({
      households: state.households.map((h, index) => (index === 0 ? { ...h, out: 0, draw: 1.2, net: -1.2 } : h)),
    }))
    rerender(<EnergyNetwork />)
    expect(first()?.className).toContain('net-node-consume')
    expect(first()?.textContent).toContain('−1.2 kW')
  })

  it('draws a flow for each settled pair once the stage has been measured', () => {
    measureStage(600, 450)
    const { chain } = useEnergyStore.getState()
    const { container } = render(<EnergyNetwork />)

    expect(chain.length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.net-flow').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.net-feeders path')).toHaveLength(
      useEnergyStore.getState().households.length,
    )
    expect(container.querySelector('.net-stage-note')).toBeNull()
  })

  it('says so plainly when nothing has settled in the window', () => {
    measureStage(600, 450)
    useEnergyStore.setState({ chain: [] })
    const { container } = render(<EnergyNetwork />)

    expect(container.querySelectorAll('.net-flow')).toHaveLength(0)
    expect(screen.getByText(/no settlements in the last window/i)).toBeTruthy()
    expect(container.querySelectorAll('.net-feeders path').length).toBeGreaterThan(0)
  })
})
