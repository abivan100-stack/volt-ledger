import { useEffect, useState, useRef } from 'react'
import { Zap, X } from 'lucide-react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { shortHash } from '../../lib/format'
import { scrollToId } from '../../utils/scrollToId'
import type { ChainBlock } from '../../lib/hashChain'
import './TradeToastTicker.css'

interface ToastItem {
  id: number
  block: ChainBlock
  timestamp: number
}

const TOAST_DURATION_MS = 4000
const MAX_TOASTS = 2

function TradeToastTicker() {
  const chain = useEnergyStore((state) => state.chain)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const lastBlockIdRef = useRef<number | null>(chain[chain.length - 1]?.id ?? null)
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      lastBlockIdRef.current = chain[chain.length - 1]?.id ?? null
      return
    }

    const latestBlock = chain[chain.length - 1]
    if (latestBlock && latestBlock.id !== lastBlockIdRef.current) {
      lastBlockIdRef.current = latestBlock.id
      if (!latestBlock.invalid) {
        const item: ToastItem = {
          id: latestBlock.id,
          block: latestBlock,
          timestamp: Date.now(),
        }
        setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), item])
      }
    }
  }, [chain])

  // Timer to auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return

    const interval = setInterval(() => {
      const now = Date.now()
      setToasts((prev) => prev.filter((t) => now - t.timestamp < TOAST_DURATION_MS))
    }, 500)

    return () => clearInterval(interval)
  }, [toasts.length])

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const handleInspect = (id: number) => {
    dismissToast(id)
    scrollToId('chain-ledger')
  }

  if (toasts.length === 0) return null

  return (
    <aside aria-label="Live settlement notifications" className="trade-toast-container">
      {toasts.map(({ id, block }) => (
        <div key={id} role="status" className="trade-toast-card">
          <div className="trade-toast-header">
            <span className="trade-toast-tag">
              <Zap className="trade-toast-bolt" aria-hidden="true" />
              <span className="mono trade-toast-title">P2P SETTLEMENT #{block.id}</span>
            </span>
            <span className="mono trade-toast-time">{block.payload.t}</span>
            <button
              type="button"
              className="trade-toast-close"
              aria-label="Dismiss trade notification"
              onClick={() => dismissToast(id)}
            >
              <X className="trade-toast-x" aria-hidden="true" />
            </button>
          </div>

          <div className="trade-toast-body">
            <div className="trade-toast-parties">
              <span className="trade-toast-party trade-toast-from">{block.payload.from}</span>
              <span className="mono trade-toast-arrow">→</span>
              <span className="trade-toast-party trade-toast-to">{block.payload.to}</span>
            </div>
            <div className="mono trade-toast-metric">
              <strong>{block.payload.kwh.toFixed(2)} kWh</strong>
              <span className="trade-toast-inr"> (+₹{block.payload.credit.toFixed(2)})</span>
            </div>
          </div>

          <div className="trade-toast-footer">
            <span className="mono trade-toast-hash">SEAL: {shortHash(block.hash)}</span>
            <button
              type="button"
              className="mono trade-toast-view"
              onClick={() => handleInspect(id)}
            >
              VIEW LEDGER →
            </button>
          </div>
        </div>
      ))}
    </aside>
  )
}

export default TradeToastTicker
