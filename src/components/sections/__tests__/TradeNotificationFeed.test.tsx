// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
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
    expect(screen.queryByText('Live Trades')).toBeNull()
  })

  it('renders a live trade card when trade is dispatched and dismisses on close click', async () => {
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
    expect(screen.getByText('Live Trades')).toBeTruthy()

    // Test dismissal
    const closeBtn = screen.getByRole('button', { name: /dismiss notification/i })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByText('P2P Settled')).toBeNull()
    })
  })

  it('renders tamper alert and restore alert cards', () => {
    render(<TradeNotificationFeed />)

    act(() => {
      useEnergyStore.setState({ compromised: true, invalidCount: 2 })
    })

    expect(screen.getByText('Integrity Alert')).toBeTruthy()
    expect(screen.getByText(/2 downstream block\(s\) failed/i)).toBeTruthy()

    act(() => {
      useEnergyStore.setState({ compromised: false, invalidCount: 0, restoredFlash: true })
    })

    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText(/Hash chain verified back to genesis/i)).toBeTruthy()
  })

  it('allows user to toggle mute button', () => {
    render(<TradeNotificationFeed />)

    act(() => {
      useEnergyStore.setState({ compromised: true, invalidCount: 1 })
    })

    const muteBtn = screen.getByTitle(/mute trade notifications/i)
    expect(screen.getByText('Live Trades')).toBeTruthy()

    fireEvent.click(muteBtn)
    expect(screen.getByText('Muted')).toBeTruthy()
  })
})
