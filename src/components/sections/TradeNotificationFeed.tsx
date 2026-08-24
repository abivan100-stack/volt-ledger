import { AnimatePresence, motion } from 'motion/react'
import { Bell, BellOff, X } from 'lucide-react'
import { useTradeNotifications } from '../../hooks/useTradeNotifications'
import './TradeNotificationFeed.css'

export function TradeNotificationFeed() {
  const { notifications, dismiss, isMuted, toggleMute } = useTradeNotifications()

  return (
    <aside className="volt-trade-feed" aria-live="polite" aria-label="Real-time Trade Ticker">
      {notifications.length > 0 && (
        <button
          type="button"
          onClick={toggleMute}
          className="volt-trade-mute-control"
          title={isMuted ? 'Unmute trade notifications' : 'Mute trade notifications'}
        >
          {isMuted ? <BellOff size={11} /> : <Bell size={11} />}
          <span>{isMuted ? 'Muted' : 'Live P2P'}</span>
        </button>
      )}

      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95, transition: { duration: 0.12 } }}
            className={`volt-trade-card volt-trade-card-${n.type}`}
          >
            <div className="volt-trade-main">
              <span className={`volt-trade-pulse volt-trade-pulse-${n.type}`} aria-hidden="true" />

              {n.type === 'trade' && (
                <div className="volt-trade-text">
                  <span className="volt-trade-peers">
                    {n.from?.split(' ')[0]} <span className="volt-trade-arrow">➔</span> {n.to?.split(' ')[0]}
                  </span>
                  <span className="volt-trade-meta">
                    {n.kwh?.toFixed(2)} kWh · ₹{n.credit?.toFixed(2)}
                  </span>
                </div>
              )}

              {n.type === 'tamper' && (
                <div className="volt-trade-text">
                  <strong className="text-void">Tamper Alert:</strong>
                  <span className="volt-trade-meta">
                    {n.tamperedCount} block(s) invalidated
                  </span>
                </div>
              )}

              {n.type === 'restore' && (
                <div className="volt-trade-text">
                  <strong className="text-settle">Verified:</strong>
                  <span className="volt-trade-meta">Chain restored to genesis</span>
                </div>
              )}
            </div>

            <div className="volt-trade-actions">
              <button
                type="button"
                className="volt-trade-close-btn"
                onClick={() => dismiss(n.id)}
                aria-label="Dismiss notification"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </aside>
  )
}
