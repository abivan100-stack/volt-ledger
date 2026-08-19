// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('frames the graph with only a compact live label and status', () => {
    render(<EnergyNetwork />)

    expect(screen.getByText('Live · Nolambur microgrid')).toBeTruthy()
    expect(screen.queryByText(/who is generating, who is drawing/i)).toBeNull()
    expect(screen.queryByText('Generating')).toBeNull()
    expect(screen.queryByText('Consuming')).toBeNull()
    expect(screen.queryByText('Balance')).toBeNull()
    expect(screen.queryByText('Active flows')).toBeNull()
  })

  it('draws one node per household, labelled from live store data', () => {
    const { households } = useEnergyStore.getState()
    const { container } = render(<EnergyNetwork />)

    expect(container.querySelectorAll('.net-node')).toHaveLength(households.length)
    for (const household of households) {
      expect(screen.getByText(shortName(household.name).toUpperCase())).toBeTruthy()
    }
  })

  it('reports the live network status without exposing dashboard totals', () => {
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
    expect(screen.queryByText(generated.toFixed(1))).toBeNull()
    expect(screen.queryByText(consumed.toFixed(1))).toBeNull()
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
    expect(container.querySelectorAll('.net-feeder-loop')).toHaveLength(
      useEnergyStore.getState().households.length,
    )
    expect(container.querySelectorAll('.net-feeder-mesh')).toHaveLength(5)
  })

  it('keeps the permanent neighbourhood web when nothing has settled', () => {
    measureStage(600, 450)
    useEnergyStore.setState({ chain: [] })
    const { container } = render(<EnergyNetwork />)

    expect(container.querySelectorAll('.net-flow')).toHaveLength(0)
    expect(container.querySelectorAll('.net-feeder-loop')).toHaveLength(10)
    expect(container.querySelectorAll('.net-feeder-mesh')).toHaveLength(5)
  })

  it('filters invalid and tampered settlements from visible flows', () => {
    measureStage(600, 450)
    const { chain } = useEnergyStore.getState()
    useEnergyStore.setState({
      chain: chain.map((block, index) => ({
        ...block,
        invalid: index % 2 === 0,
        tampered: index % 2 === 1,
      })),
    })

    const { container } = render(<EnergyNetwork />)

    expect(container.querySelectorAll('.net-flow')).toHaveLength(0)
    expect(container.querySelectorAll('.net-feeder-loop')).toHaveLength(10)
  })

  it('supports keyboard focus with one non-duplicated accessible label per node', () => {
    measureStage(600, 450)
    const { container } = render(<EnergyNetwork />)
    const nodes = screen.getAllByRole('group')

    expect(nodes).toHaveLength(10)
    expect(nodes[0].getAttribute('tabindex')).toBe('0')
    expect(nodes[0].getAttribute('aria-label')).toMatch(/Nikil Sundaram/)
    expect(nodes[0].querySelector('.sr-only')).toBeNull()

    fireEvent.focus(nodes[0])
    expect(container.querySelector('.net-stage')?.hasAttribute('data-hovering')).toBe(true)
    fireEvent.blur(nodes[0])
    expect(container.querySelector('.net-stage')?.hasAttribute('data-hovering')).toBe(false)
  })

  it('renders the permanent web without ResizeObserver support', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 450,
      top: 0,
      left: 0,
      right: 600,
      bottom: 450,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.stubGlobal('ResizeObserver', undefined)

    const { container } = render(<EnergyNetwork />)

    expect(container.querySelectorAll('.net-feeder-loop')).toHaveLength(10)
    expect(container.querySelectorAll('.net-feeder-mesh')).toHaveLength(5)
  })
})
