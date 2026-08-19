import { useEffect, useState } from 'react'
import { effectiveTheme, readThemePreference, setThemePreference } from '../../theme/themeMode'
import './ThemeToggle.css'

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => effectiveTheme() === 'dark')

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const handleSystemThemeChange = () => {
      if (readThemePreference() === 'system') setIsDark(media.matches)
    }
    media.addEventListener?.('change', handleSystemThemeChange)
    return () => media.removeEventListener?.('change', handleSystemThemeChange)
  }, [])

  function handleToggle() {
    const next = isDark ? 'light' : 'dark'
    setThemePreference(next)
    setIsDark(next === 'dark')
  }

  return (
    <button
      type="button"
      className="mono theme-toggle"
      onClick={handleToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="theme-toggle-icon">
        {isDark ? (
          <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      <span className="theme-toggle-label">{isDark ? 'LIGHT' : 'DARK'}</span>
    </button>
  )
}

export default ThemeToggle
