// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useTradeNotifications } from '../useTradeNotifications'
import { useEnergyStore } from '../../store/useEnergyStore'
import { appendBlock } from '../../lib/hashChain'

describe('useTradeNotifications', () => {
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

  it('starts with empty notifications', () => {
    const { result } = renderHook(() => useTradeNotifications())
    expect(result.current.notifications.length).toBe(0)
    expect(result.current.isMuted).toBe(false)
  })

  it('toggles mute setting', () => {
    const { result } = renderHook(() => useTradeNotifications())
    act(() => {
      result.current.toggleMute()
    })
    expect(result.current.isMuted).toBe(true)
  })

  it('triggers notification when block is appended', () => {
    const { result } = renderHook(() => useTradeNotifications())
    
    act(() => {
      const block = appendBlock([], 1, {
        t: '12:00',
        from: 'Nikil Sundaram',
        to: 'Prem Ramesh',
        kwh: 1.5,
        credit: 7.5,
      })
      useEnergyStore.setState({ chain: [block] })
    })

    expect(result.current.notifications.length).toBe(1)
    expect(result.current.notifications[0].from).toBe('Nikil Sundaram')
    expect(result.current.notifications[0].to).toBe('Prem Ramesh')
    expect(result.current.notifications[0].kwh).toBe(1.5)
  })

  it('triggers notification when ledger integrity is compromised', () => {
    const { result } = renderHook(() => useTradeNotifications())

    act(() => {
      useEnergyStore.setState({ compromised: true, invalidCount: 2 })
    })

    expect(result.current.notifications.length).toBe(1)
    expect(result.current.notifications[0].type).toBe('tamper')
    expect(result.current.notifications[0].tamperedCount).toBe(2)
  })

  it('dismisses a notification', () => {
    const { result } = renderHook(() => useTradeNotifications())

    act(() => {
      useEnergyStore.setState({ compromised: true, invalidCount: 1 })
    })

    expect(result.current.notifications.length).toBe(1)
    const id = result.current.notifications[0].id

    act(() => {
      result.current.dismiss(id)
    })

    expect(result.current.notifications.length).toBe(0)
  })
})
