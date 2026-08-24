import { AnimatePresence, motion } from 'motion/react'
import { Bell, BellOff, X } from 'lucide-react'
import { useTradeNotifications } from '../../hooks/useTradeNotifications'
import './TradeNotificationFeed.css'

export function TradeNotificationFeed() {
  const { notifications, dismiss, isMuted, toggleMute } = useTradeNotifications()

  return (
    <div className="volt-trade-feed" aria-live="polite">
      {notifications.length > 0 && (
        <button
          type="button"
          onClick={toggleMute}
          className="volt-trade-mute-control"
          title={isMuted ? 'Unmute trade notifications' : 'Mute trade notifications'}
        >
          {isMuted ? <BellOff size={13} /> : <Bell size={13} />}
          <span>{isMuted ? 'Muted' : 'Live Trades'}</span>
        </button>
      )}

      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            className={`volt-trade-card volt-trade-card-${n.type}`}
          >
            <div className="volt-trade-header">
              <span className={`volt-trade-badge volt-trade-badge-${n.type}`}>
                {n.type === 'trade' && 'P2P Settled'}
                {n.type === 'tamper' && 'Integrity Alert'}
                {n.type === 'restore' && 'Verified'}
              </span>
              <button
                type="button"
                className="volt-trade-close-btn"
                onClick={() => dismiss(n.id)}
                aria-label="Dismiss notification"
              >
                <X size={13} />
              </button>
            </div>

            <div className="volt-trade-body">
              {n.type === 'trade' && (
                <>
                  <div className="volt-trade-peers">
                    <span>{n.from}</span>
                    <span className="volt-trade-arrow">➔</span>
                    <span>{n.to}</span>
                  </div>
                  <div className="volt-trade-meta">
                    <span>{n.kwh?.toFixed(2)} kWh</span>
                    <span>•</span>
                    <span>₹{n.credit?.toFixed(2)}</span>
                    {n.blockId && (
                      <>
                        <span>•</span>
                        <span>#{n.blockId}</span>
                      </>
                    )}
                  </div>
                  {n.hash && (
                    <div className="volt-trade-hash">
                      hash: {n.hash.slice(0, 10)}...{n.hash.slice(-6)}
                    </div>
                  )}
                </>
              )}

              {n.type === 'tamper' && (
                <div>
                  <strong>Ledger Invalidation:</strong> {n.tamperedCount} downstream block(s) failed SHA-256 hash check.
                </div>
              )}

              {n.type === 'restore' && (
                <div>
                  <strong>Ledger Restored:</strong> Hash chain verified back to genesis.
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
