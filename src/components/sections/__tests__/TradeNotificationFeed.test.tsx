// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { TradeNotificationFeed } from '../TradeNotificationFeed'
import { useEnergyStore } from '../../../store/useEnergyStore'
import { appendBlock } from '../../../lib/hashChain'

describe('TradeNotificationFeed', () => {
  beforeEach(() => {
    useEnergyStore.setState({
      chain: [],
      compromised: false,
      invalidCount: 0,
      restoredFlash: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders without crashing when empty', () => {
    render(<TradeNotificationFeed />)
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('renders a live trade card when trade is dispatched', () => {
    render(<TradeNotificationFeed />)

    act(() => {
      const block = appendBlock([], 1, {
        t: '14:30',
        from: 'Pranav P',
        to: 'Abivan',
        kwh: 0.85,
        credit: 4.25,
      })
      useEnergyStore.setState({ chain: [block] })
    })

    expect(screen.getByText('P2P Settled')).toBeTruthy()
    expect(screen.getByText('Pranav P')).toBeTruthy()
    expect(screen.getByText('Abivan')).toBeTruthy()
  })
})
