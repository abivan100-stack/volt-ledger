// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import { TradeNotificationFeed } from '../TradeNotificationFeed'
import { useEnergyStore } from '../../../store/useEnergyStore'
import { appendBlock } from '../../../lib/hashChain'

describe('TradeNotificationFeed', () => {
  beforeEach(() => {
    window.localStorage.clear()
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

  it('renders without crashing when empty and unmuted', () => {
    render(<TradeNotificationFeed />)
    expect(screen.queryByText('Live P2P')).toBeNull()
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

    expect(screen.getByText('Live P2P')).toBeTruthy()
    expect(screen.getByText(/0.85 kWh · ₹4.25/i)).toBeTruthy()

    // Test dismissal
    const closeBtn = screen.getByRole('button', { name: /dismiss notification/i })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByText(/0.85 kWh · ₹4.25/i)).toBeNull()
    })
  })

  it('renders tamper alert and restore alert cards', () => {
    render(<TradeNotificationFeed />)

    act(() => {
      useEnergyStore.setState({ compromised: true, invalidCount: 2 })
    })

    expect(screen.getByText(/Tamper Alert:/i)).toBeTruthy()
    expect(screen.getByText(/2 block\(s\) invalidated/i)).toBeTruthy()

    act(() => {
      useEnergyStore.setState({ compromised: false, invalidCount: 0, restoredFlash: true })
    })

    expect(screen.getByText(/Verified:/i)).toBeTruthy()
    expect(screen.getByText(/Chain restored to genesis/i)).toBeTruthy()
  })

  it('allows user to toggle mute button and unmute even with zero active notifications', () => {
    render(<TradeNotificationFeed />)

    act(() => {
      useEnergyStore.setState({ compromised: true, invalidCount: 1 })
    })

    const muteBtn = screen.getByRole('button', { name: /click to mute live trade ticker/i })
    expect(screen.getByText('Live P2P')).toBeTruthy()

    fireEvent.click(muteBtn)
    expect(screen.getByText(/Ticker Muted \(Click to Unmute\)/i)).toBeTruthy()

    // Dismiss active notification so 0 notifications remain
    const closeBtn = screen.getByRole('button', { name: /dismiss notification/i })
    fireEvent.click(closeBtn)

    // The unmute button remains available and interactive
    const unmuteBtn = screen.getByRole('button', { name: /click to unmute live trade ticker/i })
    expect(unmuteBtn).toBeTruthy()

    fireEvent.click(unmuteBtn)
    expect(screen.queryByText(/Ticker Muted/i)).toBeNull()
  })
})
