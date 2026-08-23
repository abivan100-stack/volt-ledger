// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import TradeToastTicker from '../TradeToastTicker'
import { useEnergyStore } from '../../../store/useEnergyStore'
import type { ChainBlock } from '../../../lib/hashChain'

const pristineState = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristineState, true)
})

afterEach(() => {
  cleanup()
})

const sampleBlock: ChainBlock = {
  id: 99,
  prevHash: 'GENESIS',
  payload: {
    t: '12:30',
    from: 'Pranav P.',
    to: 'Abivan S.',
    kwh: 1.15,
    credit: 6.33,
  },
  origKwh: 1.15,
  hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  calc: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  invalid: false,
  tampered: false,
}

describe('TradeToastTicker component', () => {
  it('renders nothing on initial mount before new trades arrive', () => {
    const { container } = render(<TradeToastTicker />)
    expect(container.firstChild).toBeNull()
  })

  it('displays a toast when a new block is appended to the chain', () => {
    render(<TradeToastTicker />)

    act(() => {
      useEnergyStore.setState({
        chain: [...useEnergyStore.getState().chain, sampleBlock],
      })
    })

    expect(screen.getByText(/P2P SETTLEMENT #99/i).textContent).toBeTruthy()
    expect(screen.getByText(/Pranav P\./i).textContent).toBeTruthy()
    expect(screen.getByText(/Abivan S\./i).textContent).toBeTruthy()
    expect(screen.getByText(/1\.15 kWh/i).textContent).toBeTruthy()
  })

  it('allows manual dismissal of a toast', () => {
    render(<TradeToastTicker />)

    act(() => {
      useEnergyStore.setState({
        chain: [...useEnergyStore.getState().chain, sampleBlock],
      })
    })

    const closeBtn = screen.getByLabelText(/Dismiss trade notification/i)
    fireEvent.click(closeBtn)

    expect(screen.queryByText(/P2P SETTLEMENT #99/i)).toBeNull()
  })
})
