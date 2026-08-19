import './AppLoading.css'

function AppLoading() {
  return (
    <main className="app-loading-screen" aria-busy="true" aria-live="polite">
      <div className="app-loading-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false">
          <circle cx="32" cy="32" r="22" />
          <path d="M32 13v10M49 23l-9 6M49 41l-10-5M32 51V41M15 41l10-5M15 23l9 6" />
          <path className="app-loading-bolt" d="M35.2 14.2 21.6 35.1h10.1l-2.4 14.7 13.3-22.2H32.4Z" />
        </svg>
      </div>
      <p className="mono app-loading-label">CONNECTING TO THE LEDGER</p>
      <div className="app-loading-track" role="progressbar" aria-label="Loading Volt">
        <span />
      </div>
    </main>
  )
}

export default AppLoading
