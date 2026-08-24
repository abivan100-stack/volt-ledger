import { useState, useEffect, useRef, useCallback } from 'react'
import { useEnergyStore } from '../store/useEnergyStore'

export interface TradeNotification {
  id: string
  type: 'trade' | 'tamper' | 'restore'
  title: string
  timestamp: string
  blockId?: number
  from?: string
  to?: string
  kwh?: number
  credit?: number
  hash?: string
  tamperedCount?: number
}

const MAX_ACTIVE_NOTIFICATIONS = 2
const AUTO_DISMISS_MS = 4000
const STORAGE_KEY = 'volt-trade-ticker-muted'

export function useTradeNotifications() {
  const [notifications, setNotifications] = useState<TradeNotification[]>([])
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(STORAGE_KEY) === 'true'
      }
    } catch {
      // Ignore storage access errors
    }
    return false
  })

  const prevChainLenRef = useRef<number | null>(null)
  const prevCompromisedRef = useRef<boolean>(false)
  const prevRestoredRef = useRef<boolean>(false)

  const chain = useEnergyStore((s) => s.chain)
  const compromised = useEnergyStore((s) => s.compromised)
  const invalidCount = useEnergyStore((s) => s.invalidCount)
  const restoredFlash = useEnergyStore((s) => s.restoredFlash)

  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const t = timeoutsRef.current.get(id)
    if (t) {
      clearTimeout(t)
      timeoutsRef.current.delete(id)
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, String(next))
        }
      } catch {
        // Ignore storage access errors
      }
      return next
    })
  }, [])

  const addNotification = useCallback((item: Omit<TradeNotification, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const notif: TradeNotification = { ...item, id }
    setNotifications((prev) => [notif, ...prev].slice(0, MAX_ACTIVE_NOTIFICATIONS))

    const timeout = setTimeout(() => {
      setNotifications((current) => current.filter((n) => n.id !== id))
      timeoutsRef.current.delete(id)
    }, AUTO_DISMISS_MS)
    timeoutsRef.current.set(id, timeout)
  }, [])

  useEffect(() => {
    const map = timeoutsRef.current
    return () => {
      for (const t of map.values()) clearTimeout(t)
      map.clear()
    }
  }, [])

  // Listen to new trades appended to chain
  useEffect(() => {
    if (prevChainLenRef.current === null) {
      prevChainLenRef.current = chain.length
      return
    }

    if (chain.length > prevChainLenRef.current) {
      const newBlocks = chain.slice(prevChainLenRef.current)
      for (const block of newBlocks) {
        if (!isMuted) {
          addNotification({
            type: 'trade',
            title: `P2P Energy Trade`,
            timestamp: block.payload.t,
            blockId: block.id,
            from: block.payload.from,
            to: block.payload.to,
            kwh: block.payload.kwh,
            credit: block.payload.credit,
            hash: block.hash,
          })
        }
      }
    }
    prevChainLenRef.current = chain.length
  }, [chain, isMuted, addNotification])

  // Listen to tamper events
  useEffect(() => {
    if (!prevCompromisedRef.current && compromised && invalidCount > 0) {
      addNotification({
        type: 'tamper',
        title: `Ledger Tamper Detected`,
        timestamp: 'Just now',
        tamperedCount: invalidCount,
      })
    }
    prevCompromisedRef.current = compromised
  }, [compromised, invalidCount, addNotification])

  // Listen to restore events
  useEffect(() => {
    if (!prevRestoredRef.current && restoredFlash) {
      addNotification({
        type: 'restore',
        title: `Ledger Verified & Restored`,
        timestamp: 'Just now',
      })
    }
    prevRestoredRef.current = restoredFlash
  }, [restoredFlash, addNotification])

  return {
    notifications,
    dismiss,
    isMuted,
    toggleMute,
  }
}
